import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createCreditTraceId, recordCreditAuditSafely } from "@/lib/credit-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orderId = req.nextUrl.searchParams.get("order");
    if (orderId) {
      const payment = await prisma.creditPayment.findFirst({
        where: { id: orderId, userId: session.userId },
      });
      await prisma.creditPayment.updateMany({
        where: {
          id: orderId,
          userId: session.userId,
          status: { in: ["created", "ready"] },
        },
        data: { status: "failed", failureReason: "카카오페이 결제 실패" },
      });
      if (payment) {
        const wallet = await prisma.user.findUnique({ where: { id: session.userId }, select: { credits: true } });
        const referenceId = `payment:${payment.id}`;
        await recordCreditAuditSafely({
          userId: session.userId,
          traceId: createCreditTraceId(referenceId),
          referenceId,
          operation: "payment_ready",
          direction: "neutral",
          status: "failure",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "KAKAOPAY_REDIRECTED_FAILURE",
          summary: "카카오페이 결제 실패",
          errorMessage: "카카오페이가 결제 실패로 응답했습니다.",
          metadata: { paymentId: payment.id, paymentStatus: "failed", amountKrw: payment.amountKrw, productCode: payment.productCode },
        });
      }
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.redirect(new URL("/credits?payment=failed", req.url));
}
