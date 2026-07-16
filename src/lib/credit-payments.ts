import { getKakaoPayOrder } from "./kakaopay";
import { prisma } from "./prisma";

const TERMINAL_PAYMENT_STATUSES = new Set([
  "PART_CANCEL_PAYMENT",
  "CANCEL_PAYMENT",
  "FAIL_AUTH_PASSWORD",
  "QUIT_PAYMENT",
  "FAIL_PAYMENT",
]);

export async function finalizeApprovedCreditPayment(paymentId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.creditPayment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) return false;
    if (payment.status === "paid") return true;
    if (payment.status !== "approved") return false;

    const claimed = await tx.creditPayment.updateMany({
      where: { id: payment.id, userId, status: "approved" },
      data: { status: "crediting" },
    });
    if (claimed.count !== 1) return false;

    const referenceKey = `payment:${payment.id}:credit`;
    const existingCredit = await tx.creditLedger.findUnique({ where: { referenceKey } });
    if (!existingCredit) {
      const user = await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: payment.credits } },
        select: { credits: true },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          referenceKey,
          action: "purchase",
          source: "kakaopay",
          units: payment.credits,
          balanceAfter: user.credits,
          note: `${payment.amountKrw.toLocaleString("ko-KR")}원 결제`,
        },
      });
    }

    await tx.creditPayment.update({
      where: { id: payment.id },
      data: { status: "paid", failureReason: null },
    });
    return true;
  });
}

export async function reconcileKakaoPayCreditPayment(paymentId: string, userId: string) {
  const payment = await prisma.creditPayment.findFirst({
    where: { id: paymentId, userId },
  });
  if (!payment) return false;
  if (payment.status === "paid") return true;
  if (payment.status === "approved") {
    return finalizeApprovedCreditPayment(payment.id, userId);
  }
  if (payment.status !== "approving" || !payment.providerTid) return false;

  const order = await getKakaoPayOrder(payment.providerTid);
  const validOrder =
    order.tid === payment.providerTid &&
    order.partner_order_id === payment.partnerOrderId &&
    order.partner_user_id === userId &&
    order.amount?.total === payment.amountKrw;
  if (!validOrder) {
    await prisma.creditPayment.updateMany({
      where: { id: payment.id, userId, status: "approving" },
      data: { status: "failed", failureReason: "결제 주문 조회 정보 검증 실패" },
    });
    return false;
  }

  if (order.status === "SUCCESS_PAYMENT") {
    const paymentAction = order.payment_action_details?.find(
      (action) => action.payment_action_type === "PAYMENT"
    );
    const approvedAt = new Date(order.approved_at || paymentAction?.approved_at || Date.now());
    await prisma.creditPayment.updateMany({
      where: { id: payment.id, userId, status: "approving" },
      data: {
        status: "approved",
        providerApprovalId: paymentAction?.aid,
        paymentMethod: order.payment_method_type || paymentAction?.payment_method_type,
        approvedAt: Number.isNaN(approvedAt.getTime()) ? new Date() : approvedAt,
        failureReason: null,
      },
    });
    return finalizeApprovedCreditPayment(payment.id, userId);
  }

  if (TERMINAL_PAYMENT_STATUSES.has(order.status)) {
    await prisma.creditPayment.updateMany({
      where: { id: payment.id, userId, status: "approving" },
      data: {
        status: order.status.includes("CANCEL") || order.status === "QUIT_PAYMENT"
          ? "cancelled"
          : "failed",
        failureReason: `카카오페이 주문 상태: ${order.status}`,
      },
    });
  }
  return false;
}
