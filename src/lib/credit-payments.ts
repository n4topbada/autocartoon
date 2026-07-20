import {
  createCreditAuditEvent,
  createCreditLedgerWithAudit,
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "./credit-audit";
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
  const referenceId = `payment:${paymentId}`;
  const traceId = createCreditTraceId(referenceId);
  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.creditPayment.findFirst({
        where: { id: paymentId, userId },
      });
      const wallet = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!payment) {
        await createCreditAuditEvent(tx, {
          userId: wallet ? userId : null,
          traceId,
          referenceId,
          operation: "payment_approve",
          direction: "credit",
          status: "failure",
          source: "kakaopay",
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "PAYMENT_NOT_FOUND",
          summary: "결제 적립 대상을 찾지 못함",
        });
        return false;
      }
      const metadata = {
        paymentId: payment.id,
        paymentStatus: payment.status,
        productCode: payment.productCode,
        amountKrw: payment.amountKrw,
      };
      if (payment.status === "paid") {
        await createCreditAuditEvent(tx, {
          userId,
          traceId,
          referenceId,
          operation: "payment_approve",
          direction: "neutral",
          status: "success",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "PAYMENT_ALREADY_CREDITED",
          summary: "이미 적립된 결제를 재확인",
          metadata: { ...metadata, idempotent: true },
        });
        return true;
      }
      if (payment.status !== "approved") {
        await createCreditAuditEvent(tx, {
          userId,
          traceId,
          referenceId,
          operation: "payment_approve",
          direction: "credit",
          status: "failure",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "PAYMENT_INVALID_STATE",
          summary: "결제 상태가 적립 조건과 맞지 않음",
          errorMessage: `현재 결제 상태: ${payment.status}`,
          metadata,
        });
        return false;
      }

      const claimed = await tx.creditPayment.updateMany({
        where: { id: payment.id, userId, status: "approved" },
        data: { status: "crediting" },
      });
      if (claimed.count !== 1) {
        await createCreditAuditEvent(tx, {
          userId,
          traceId,
          referenceId,
          operation: "payment_approve",
          direction: "neutral",
          status: "success",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: wallet?.credits,
          balanceAfter: wallet?.credits,
          reasonCode: "PAYMENT_FINALIZATION_CLAIMED",
          summary: "다른 요청이 결제 적립을 처리 중",
          metadata: { ...metadata, idempotent: true },
        });
        return false;
      }

      const referenceKey = `${referenceId}:credit`;
      const existingCredit = await tx.creditLedger.findUnique({ where: { referenceKey } });
      if (!existingCredit) {
        const user = await tx.user.update({
          where: { id: userId },
          data: { credits: { increment: payment.credits } },
          select: { credits: true },
        });
        await createCreditLedgerWithAudit(tx, {
          userId,
          referenceKey,
          referenceId,
          traceId,
          action: "purchase",
          source: "kakaopay",
          units: payment.credits,
          balanceBefore: user.credits - payment.credits,
          balanceAfter: user.credits,
          note: `${payment.amountKrw.toLocaleString("ko-KR")}원 결제`,
          reasonCode: "PAYMENT_CREDITED",
          metadata,
        });
      } else {
        const currentWallet = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
        await createCreditAuditEvent(tx, {
          userId,
          ledgerId: existingCredit.id,
          traceId,
          referenceId,
          operation: "payment_approve",
          direction: "neutral",
          status: "success",
          source: "kakaopay",
          units: existingCredit.units,
          balanceBefore: currentWallet.credits,
          balanceAfter: currentWallet.credits,
          reasonCode: "PAYMENT_LEDGER_RECOVERED",
          summary: "기존 결제 원장을 기준으로 상태 복구",
          metadata: { ...metadata, idempotent: true },
        });
      }

      await tx.creditPayment.update({
        where: { id: payment.id },
        data: { status: "paid", failureReason: null },
      });
      return true;
    });
  } catch (error) {
    const safe = sanitizeCreditAuditError(error);
    const wallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }).catch(() => null);
    await recordCreditAuditSafely({
      userId: wallet ? userId : null,
      traceId,
      referenceId,
      operation: "payment_approve",
      direction: "credit",
      status: "failure",
      source: "kakaopay",
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: safe.reasonCode,
      summary: "결제 크레딧 적립 처리 오류",
      errorMessage: safe.message,
      metadata: { paymentId },
    });
    throw error;
  }
}

export async function reconcileKakaoPayCreditPayment(paymentId: string, userId: string) {
  const referenceId = `payment:${paymentId}`;
  const traceId = createCreditTraceId(referenceId);
  const payment = await prisma.creditPayment.findFirst({ where: { id: paymentId, userId } });
  const wallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!payment) {
    await recordCreditAuditSafely({
      userId: wallet ? userId : null,
      traceId,
      referenceId,
      operation: "payment_reconcile",
      direction: "neutral",
      status: "failure",
      source: "kakaopay",
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "PAYMENT_NOT_FOUND",
      summary: "검증할 결제를 찾지 못함",
    });
    return false;
  }
  if (payment.status === "paid") return true;
  if (payment.status === "approved") return finalizeApprovedCreditPayment(payment.id, userId);
  if (payment.status !== "approving" || !payment.providerTid) {
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "payment_reconcile",
      direction: "neutral",
      status: "failure",
      source: "kakaopay",
      units: payment.credits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "PAYMENT_NOT_RECONCILABLE",
      summary: "현재 상태에서는 결제 검증 불가",
      errorMessage: `현재 결제 상태: ${payment.status}`,
      metadata: { paymentId, paymentStatus: payment.status, amountKrw: payment.amountKrw },
    });
    return false;
  }

  let order: Awaited<ReturnType<typeof getKakaoPayOrder>>;
  try {
    order = await getKakaoPayOrder(payment.providerTid);
  } catch (error) {
    const safe = sanitizeCreditAuditError(error);
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "payment_reconcile",
      direction: "neutral",
      status: "failure",
      source: "kakaopay",
      units: payment.credits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: safe.reasonCode,
      summary: "카카오페이 주문 조회 실패",
      errorMessage: safe.message,
      metadata: { paymentId, paymentStatus: payment.status, amountKrw: payment.amountKrw },
    });
    throw error;
  }
  const validOrder =
    order.tid === payment.providerTid &&
    order.partner_order_id === payment.partnerOrderId &&
    order.partner_user_id === userId &&
    order.amount?.total === payment.amountKrw;
  if (!validOrder) {
    // 주문 조회 검증이 어긋났는데 실제로는 자금이 캡처됐을 수 있다.
    // 'failed'(사용자 재시도 불가·복구 스윕 제외)로 종결하면 결제 금액이 조용히 유실되므로
    // 관리자 검토가 필요한 상태로 보존한다.
    await prisma.creditPayment.updateMany({
      where: { id: payment.id, userId, status: "approving" },
      data: {
        status: "needs_review",
        failureReason: "결제 주문 조회 정보 검증 실패 (관리자 확인 필요)",
      },
    });
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "payment_reconcile",
      direction: "neutral",
      status: "failure",
      source: "kakaopay",
      units: payment.credits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "PAYMENT_ORDER_MISMATCH",
      summary: "결제 주문 정보 검증 실패",
      errorMessage: "카카오페이 주문 정보가 내부 주문과 일치하지 않습니다.",
      metadata: { paymentId, paymentStatus: "needs_review", amountKrw: payment.amountKrw },
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
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "payment_reconcile",
      direction: "neutral",
      status: "success",
      source: "kakaopay",
      units: payment.credits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "PAYMENT_PROVIDER_CONFIRMED",
      summary: "카카오페이 승인 상태 검증 완료",
      metadata: { paymentId, paymentStatus: order.status, amountKrw: payment.amountKrw },
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
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: order.status.includes("CANCEL") || order.status === "QUIT_PAYMENT"
        ? "payment_cancel"
        : "payment_reconcile",
      direction: "neutral",
      status: "failure",
      source: "kakaopay",
      units: payment.credits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: `KAKAOPAY_${order.status}`,
      summary: order.status.includes("CANCEL") || order.status === "QUIT_PAYMENT"
        ? "카카오페이 결제 취소"
        : "카카오페이 결제 실패",
      errorMessage: `카카오페이 주문 상태: ${order.status}`,
      metadata: { paymentId, paymentStatus: order.status, amountKrw: payment.amountKrw },
    });
  }
  return false;
}
