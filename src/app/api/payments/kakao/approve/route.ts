import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  finalizeApprovedCreditPayment,
  reconcileKakaoPayCreditPayment,
} from "@/lib/credit-payments";
import { approveKakaoPay } from "@/lib/kakaopay";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function redirect(req: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/credits?payment=${status}`, req.url));
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orderId = req.nextUrl.searchParams.get("order");
    const pgToken = req.nextUrl.searchParams.get("pg_token");
    if (!orderId || !pgToken) return redirect(req, "failed");

    const payment = await prisma.creditPayment.findFirst({
      where: { id: orderId, userId: session.userId },
    });
    if (!payment) return redirect(req, "failed");
    if (payment.status === "paid") return redirect(req, "success");
    if (payment.status === "approved") {
      const finalized = await finalizeApprovedCreditPayment(payment.id, session.userId);
      return redirect(req, finalized ? "success" : "processing");
    }
    if (payment.status === "approving" || payment.status === "crediting") {
      return redirect(req, "processing");
    }
    if (payment.status !== "ready" || !payment.providerTid) return redirect(req, "failed");

    const claimed = await prisma.creditPayment.updateMany({
      where: { id: payment.id, userId: session.userId, status: "ready" },
      data: { status: "approving", failureReason: null },
    });
    if (claimed.count !== 1) return redirect(req, "processing");

    let approval;
    try {
      approval = await approveKakaoPay({
        tid: payment.providerTid,
        partnerOrderId: payment.partnerOrderId,
        partnerUserId: session.userId,
        pgToken,
      });
    } catch (error) {
      await prisma.creditPayment.updateMany({
        where: { id: payment.id, status: "approving" },
        data: {
          failureReason: error instanceof Error ? error.message.slice(0, 1_000) : "approve failed",
        },
      });
      try {
        const reconciled = await reconcileKakaoPayCreditPayment(payment.id, session.userId);
        if (reconciled) return redirect(req, "success");
        const current = await prisma.creditPayment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        if (current?.status === "failed" || current?.status === "cancelled") {
          return redirect(req, "failed");
        }
      } catch (reconcileError) {
        console.error("KakaoPay immediate reconciliation error:", reconcileError);
      }
      console.error("KakaoPay approval response error:", error);
      return redirect(req, "processing");
    }

    const validApproval =
      approval.tid === payment.providerTid &&
      approval.partner_order_id === payment.partnerOrderId &&
      approval.partner_user_id === session.userId &&
      approval.amount?.total === payment.amountKrw;
    if (!validApproval) {
      await prisma.creditPayment.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: "결제 승인 정보 검증 실패" },
      });
      return redirect(req, "failed");
    }

    const approvedAt = new Date(approval.approved_at);
    await prisma.creditPayment.update({
      where: { id: payment.id },
      data: {
        status: "approved",
        providerApprovalId: approval.aid,
        paymentMethod: approval.payment_method_type,
        approvedAt: Number.isNaN(approvedAt.getTime()) ? new Date() : approvedAt,
        failureReason: null,
      },
    });

    const finalized = await finalizeApprovedCreditPayment(payment.id, session.userId);
    return redirect(req, finalized ? "success" : "processing");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    console.error("KakaoPay approve error:", error);
    return redirect(req, "failed");
  }
}
