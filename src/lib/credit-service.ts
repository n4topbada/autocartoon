import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  createCreditAuditEvent,
  createCreditLedgerWithAudit,
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "./credit-audit";
import { getGenerationCreditCost } from "./credit-products";
import { prisma } from "./prisma";

const INSUFFICIENT_CREDITS = "크레딧이 부족합니다. 충전 후 다시 시도해주세요.";

type CreditTransaction = Prisma.TransactionClient;

type ReserveOptions = {
  units: number;
  source: string;
  referenceId: string;
  jobId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

type ReserveResult =
  | { ok: true; source: "credit"; units: number; balanceAfter: number; traceId: string }
  | { ok: false; error: string; traceId: string };

export class CreditError extends Error {
  readonly status = 402;
  readonly code = "INSUFFICIENT_CREDITS";

  constructor(message = INSUFFICIENT_CREDITS, readonly traceId?: string) {
    super(message);
    this.name = "CreditError";
  }
}

export function isCreditError(error: unknown): error is CreditError {
  return error instanceof CreditError;
}

function validateUnits(units: number) {
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("크레딧 차감량은 1 이상의 정수여야 합니다.");
  }
}

function chargeKey(referenceId: string) {
  return `${referenceId}:charge`;
}

function refundKey(referenceId: string) {
  return `${referenceId}:refund`;
}

async function reserveCreditsWithTransaction(
  tx: CreditTransaction,
  userId: string,
  options: ReserveOptions
): Promise<ReserveResult> {
  validateUnits(options.units);
  const traceId = createCreditTraceId(options.referenceId);

  const existing = await tx.creditLedger.findUnique({
    where: { referenceKey: chargeKey(options.referenceId) },
  });
  if (existing) {
    if (existing.userId !== userId || existing.units !== options.units) {
      throw new Error("동일한 크레딧 참조 키가 다른 요청에 사용되었습니다.");
    }
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credits: true },
    });
    await createCreditAuditEvent(tx, {
      userId,
      jobId: options.jobId,
      traceId,
      referenceId: options.referenceId,
      operation: "charge_reused",
      direction: "neutral",
      status: "success",
      source: options.source,
      units: existing.units,
      balanceBefore: user.credits,
      balanceAfter: user.credits,
      reasonCode: "IDEMPOTENT_REPLAY",
      summary: "이미 처리된 크레딧 차감을 안전하게 재사용",
      metadata: { ...options.metadata, idempotent: true },
    });
    return {
      ok: true,
      source: "credit",
      units: existing.units,
      balanceAfter: existing.balanceAfter ?? user.credits,
      traceId,
    };
  }

  const deduction = await tx.user.updateMany({
    where: { id: userId, credits: { gte: options.units } },
    data: { credits: { decrement: options.units } },
  });
  if (deduction.count !== 1) {
    const wallet = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    const audit = await createCreditAuditEvent(tx, {
      userId: wallet ? userId : null,
      jobId: options.jobId,
      traceId,
      referenceId: options.referenceId,
      operation: "charge",
      direction: "debit",
      status: "failure",
      source: options.source,
      units: options.units,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: wallet ? "INSUFFICIENT_CREDITS" : "USER_NOT_FOUND",
      summary: wallet ? "크레딧 부족으로 차감 거절" : "사용자를 찾지 못해 차감 거절",
      errorMessage: wallet
        ? `필요 ${options.units.toLocaleString("ko-KR")}C, 보유 ${wallet.credits.toLocaleString("ko-KR")}C`
        : "크레딧 계정을 찾을 수 없습니다.",
      metadata: options.metadata,
    });
    return { ok: false, error: INSUFFICIENT_CREDITS, traceId: audit.traceId };
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  await createCreditLedgerWithAudit(tx, {
    userId,
    jobId: options.jobId,
    referenceKey: chargeKey(options.referenceId),
    referenceId: options.referenceId,
    traceId,
    action: "charge",
    source: options.source,
    units: options.units,
    balanceBefore: user.credits + options.units,
    balanceAfter: user.credits,
    note: options.note,
    metadata: options.metadata,
  });

  return {
    ok: true,
    source: "credit",
    units: options.units,
    balanceAfter: user.credits,
    traceId,
  };
}

async function reserveCredits(
  userId: string,
  options: ReserveOptions
): Promise<ReserveResult> {
  try {
    return await prisma.$transaction((tx) => reserveCreditsWithTransaction(tx, userId, options));
  } catch (error) {
    const safe = sanitizeCreditAuditError(error);
    const wallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }).catch(() => null);
    await recordCreditAuditSafely({
      userId: wallet ? userId : null,
      jobId: options.jobId,
      traceId: createCreditTraceId(options.referenceId),
      referenceId: options.referenceId,
      operation: "charge",
      direction: "debit",
      status: "failure",
      source: options.source,
      units: options.units,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: safe.reasonCode,
      summary: "크레딧 차감 처리 중 오류",
      errorMessage: safe.message,
      metadata: options.metadata,
    });
    throw error;
  }
}

async function refundCreditsWithTransaction(
  tx: CreditTransaction,
  userId: string,
  referenceId: string,
  note?: string
) {
  const traceId = createCreditTraceId(referenceId);
  const existingRefund = await tx.creditLedger.findUnique({
    where: { referenceKey: refundKey(referenceId) },
  });
  if (existingRefund) {
    const wallet = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    await createCreditAuditEvent(tx, {
      userId: wallet ? userId : null,
      jobId: existingRefund.jobId,
      traceId,
      referenceId,
      operation: "refund",
      direction: "neutral",
      status: "success",
      source: existingRefund.source,
      units: existingRefund.units,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "REFUND_ALREADY_APPLIED",
      summary: "이미 처리된 환불을 안전하게 재확인",
      metadata: { idempotent: true },
    });
    return;
  }

  const charge = await tx.creditLedger.findUnique({
    where: { referenceKey: chargeKey(referenceId) },
  });
  if (!charge || charge.userId !== userId) {
    const wallet = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    await createCreditAuditEvent(tx, {
      userId: wallet ? userId : null,
      traceId,
      referenceId,
      operation: "refund",
      direction: "neutral",
      status: "failure",
      source: charge?.source || "unknown",
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: charge ? "REFUND_USER_MISMATCH" : "CHARGE_NOT_FOUND",
      summary: "환불할 원거래를 찾지 못함",
      errorMessage: "원 차감 기록과 환불 요청을 연결할 수 없습니다.",
    });
    return;
  }

  if (charge.source === "tier") {
    await tx.user.updateMany({
      where: { id: userId, tierUsedThisMonth: { gt: 0 } },
      data: { tierUsedThisMonth: { decrement: charge.units } },
    });
  } else {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: charge.units } },
    });
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  const isTier = charge.source === "tier";
  await createCreditLedgerWithAudit(tx, {
    userId,
    jobId: charge.jobId,
    referenceKey: refundKey(referenceId),
    referenceId,
    traceId,
    action: "refund",
    direction: isTier ? "neutral" : "credit",
    source: charge.source,
    units: charge.units,
    balanceBefore: isTier ? user.credits : user.credits - charge.units,
    balanceAfter: user.credits,
    note,
  });
}

async function refundCredits(
  userId: string,
  referenceId: string,
  note?: string,
  transaction?: CreditTransaction
) {
  if (transaction) {
    await refundCreditsWithTransaction(transaction, userId, referenceId, note);
    return;
  }
  await prisma.$transaction((tx) =>
    refundCreditsWithTransaction(tx, userId, referenceId, note)
  );
}

export async function withCreditCharge<T>(
  userId: string,
  options: Omit<ReserveOptions, "referenceId"> & { referenceId?: string },
  operation: (referenceId: string) => Promise<T>
): Promise<T> {
  const referenceId = options.referenceId ?? `direct:${options.source}:${randomUUID()}`;
  const result = await reserveCredits(userId, { ...options, referenceId });
  if (!result.ok) throw new CreditError(result.error, result.traceId);

  try {
    return await operation(referenceId);
  } catch (error) {
    const safe = sanitizeCreditAuditError(error);
    const wallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }).catch(() => null);
    await recordCreditAuditSafely({
      userId: wallet ? userId : null,
      traceId: result.traceId,
      referenceId,
      operation: "usage",
      direction: "neutral",
      status: "failure",
      source: options.source,
      units: options.units,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: safe.reasonCode,
      summary: "유료 기능 실행 실패",
      errorMessage: safe.message,
      metadata: options.metadata,
    });
    try {
      await refundCredits(userId, referenceId, "AI 요청 실패 자동 환불");
    } catch (refundError) {
      const refundSafe = sanitizeCreditAuditError(refundError);
      const currentWallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }).catch(() => null);
      await recordCreditAuditSafely({
        userId: currentWallet ? userId : null,
        traceId: result.traceId,
        referenceId,
        operation: "refund",
        direction: "credit",
        status: "failure",
        source: options.source,
        units: options.units,
        balanceBefore: currentWallet?.credits,
        balanceAfter: currentWallet?.credits,
        reasonCode: refundSafe.reasonCode,
        summary: "자동 환불 처리 실패",
        errorMessage: refundSafe.message,
      });
      console.error("Credit refund failed:", refundError);
    }
    throw error;
  }
}

export async function reserveJobCredit(
  userId: string,
  jobId: string
): Promise<{ ok: boolean; error?: string; source?: "tier" | "credit"; units?: number; traceId?: string }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.generationJob.findFirst({
      where: { id: jobId, userId },
      select: { id: true, kind: true, input: true, creditSource: true, creditUnits: true },
    });
    if (!job) {
      const wallet = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const traceId = createCreditTraceId(`job:${jobId}`);
      await createCreditAuditEvent(tx, {
        userId: wallet ? userId : null,
        traceId,
        referenceId: `job:${jobId}`,
        operation: "charge",
        direction: "debit",
        status: "failure",
        source: "generation",
        balanceBefore: wallet?.credits,
        balanceAfter: wallet?.credits,
        reasonCode: "JOB_NOT_FOUND",
        summary: "생성 작업을 찾지 못해 차감 거절",
      });
      return { ok: false, error: "생성 작업을 찾을 수 없습니다.", traceId };
    }

    const existingCharge = await tx.creditLedger.findUnique({
      where: { jobId_action: { jobId, action: "charge" } },
    });
    if (existingCharge) {
      const wallet = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
      const traceId = createCreditTraceId(`job:${jobId}`);
      await createCreditAuditEvent(tx, {
        userId,
        jobId,
        traceId,
        referenceId: `job:${jobId}`,
        operation: "charge_reused",
        direction: "neutral",
        status: "success",
        source: existingCharge.source,
        units: existingCharge.units,
        balanceBefore: wallet.credits,
        balanceAfter: wallet.credits,
        reasonCode: "IDEMPOTENT_REPLAY",
        summary: "이미 처리된 생성 차감을 재사용",
        metadata: { idempotent: true },
      });
      return {
        ok: true,
        source: existingCharge.source as "tier" | "credit",
        units: existingCharge.units,
        traceId,
      };
    }

    const input =
      job.input && typeof job.input === "object" && !Array.isArray(job.input)
        ? (job.input as Record<string, unknown>)
        : {};
    const units = job.creditUnits ?? getGenerationCreditCost(job.kind, input);
    const metadata = {
      provider: typeof input.provider === "string" ? input.provider : undefined,
      model: typeof input.model === "string" ? input.model : undefined,
      imageSize: typeof input.imageSize === "string" ? input.imageSize : undefined,
      requestedCount: typeof input.count === "number" ? input.count : undefined,
    };
    const result = await reserveCreditsWithTransaction(tx, userId, {
      units,
      source: job.kind,
      referenceId: `job:${jobId}`,
      jobId,
      metadata,
    });
    if (!result.ok) return result;

    await tx.generationJob.update({
      where: { id: jobId },
      data: { creditSource: "credit", creditUnits: units },
    });
    return { ok: true, source: "credit", units, traceId: result.traceId };
  });
}

export async function refundJobCredit(
  jobId: string,
  note?: string,
  transaction?: CreditTransaction
): Promise<void> {
  const refund = async (tx: CreditTransaction) => {
    const job = await tx.generationJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true, creditSource: true },
    });
    if (!job?.creditSource) return;
    await refundCreditsWithTransaction(tx, job.userId, `job:${jobId}`, note);
  };

  if (transaction) {
    await refund(transaction);
    return;
  }
  await prisma.$transaction(refund);
}
