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
        data: { status: "cancelled", failureReason: "사용자 결제 취소" },
      });
      if (payment) {
        const wallet = await prisma.user.findUnique({ where: { id: session.userId }, select: { credits: true } });
        const referenceId = `payment:${payment.id}`;
        await recordCreditAuditSafely({
          userId: session.userId,
          traceId: createCreditTraceId(referenceId),
          referenceId,
          operation: "payment_cancel",
          direction: "neutral",
          status: "failure",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "PAYMENT_CANCELLED_BY_USER",
          summary: "사용자가 결제를 취소",
          errorMessage: "결제창에서 결제를 취소했습니다.",
          metadata: { paymentId: payment.id, paymentStatus: "cancelled", amountKrw: payment.amountKrw, productCode: payment.productCode },
        });
      }
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.redirect(new URL("/credits?payment=cancelled", req.url));
}
