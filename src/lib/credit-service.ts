import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
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
};

type ReserveResult =
  | { ok: true; source: "credit"; units: number; balanceAfter: number }
  | { ok: false; error: string };

export class CreditError extends Error {
  readonly status = 402;
  readonly code = "INSUFFICIENT_CREDITS";

  constructor(message = INSUFFICIENT_CREDITS) {
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
    return {
      ok: true,
      source: "credit",
      units: existing.units,
      balanceAfter: existing.balanceAfter ?? user.credits,
    };
  }

  const deduction = await tx.user.updateMany({
    where: { id: userId, credits: { gte: options.units } },
    data: { credits: { decrement: options.units } },
  });
  if (deduction.count !== 1) {
    return { ok: false, error: INSUFFICIENT_CREDITS };
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  await tx.creditLedger.create({
    data: {
      userId,
      jobId: options.jobId,
      referenceKey: chargeKey(options.referenceId),
      action: "charge",
      source: options.source,
      units: options.units,
      balanceAfter: user.credits,
      note: options.note,
    },
  });

  return {
    ok: true,
    source: "credit",
    units: options.units,
    balanceAfter: user.credits,
  };
}

async function reserveCredits(
  userId: string,
  options: ReserveOptions
): Promise<ReserveResult> {
  return prisma.$transaction((tx) => reserveCreditsWithTransaction(tx, userId, options));
}

async function refundCreditsWithTransaction(
  tx: CreditTransaction,
  userId: string,
  referenceId: string,
  note?: string
) {
  const existingRefund = await tx.creditLedger.findUnique({
    where: { referenceKey: refundKey(referenceId) },
  });
  if (existingRefund) return;

  const charge = await tx.creditLedger.findUnique({
    where: { referenceKey: chargeKey(referenceId) },
  });
  if (!charge || charge.userId !== userId) return;

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
  await tx.creditLedger.create({
    data: {
      userId,
      jobId: charge.jobId,
      referenceKey: refundKey(referenceId),
      action: "refund",
      source: charge.source,
      units: charge.units,
      balanceAfter: user.credits,
      note,
    },
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
  if (!result.ok) throw new CreditError(result.error);

  try {
    return await operation(referenceId);
  } catch (error) {
    try {
      await refundCredits(userId, referenceId, "AI 요청 실패 자동 환불");
    } catch (refundError) {
      console.error("Credit refund failed:", refundError);
    }
    throw error;
  }
}

export async function reserveJobCredit(
  userId: string,
  jobId: string
): Promise<{ ok: boolean; error?: string; source?: "tier" | "credit"; units?: number }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.generationJob.findFirst({
      where: { id: jobId, userId },
      select: { id: true, kind: true, input: true, creditSource: true, creditUnits: true },
    });
    if (!job) return { ok: false, error: "생성 작업을 찾을 수 없습니다." };

    const existingCharge = await tx.creditLedger.findUnique({
      where: { jobId_action: { jobId, action: "charge" } },
    });
    if (existingCharge) {
      return {
        ok: true,
        source: existingCharge.source as "tier" | "credit",
        units: existingCharge.units,
      };
    }

    const input =
      job.input && typeof job.input === "object" && !Array.isArray(job.input)
        ? (job.input as Record<string, unknown>)
        : {};
    const units = job.creditUnits ?? getGenerationCreditCost(job.kind, input);
    const result = await reserveCreditsWithTransaction(tx, userId, {
      units,
      source: job.kind,
      referenceId: `job:${jobId}`,
      jobId,
    });
    if (!result.ok) return result;

    await tx.generationJob.update({
      where: { id: jobId },
      data: { creditSource: "credit", creditUnits: units },
    });
    return { ok: true, source: "credit", units };
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
