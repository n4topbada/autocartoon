import { prisma } from "./prisma";
import { TIER_LIMITS } from "./tier-config";
import type { Prisma } from "@prisma/client";

export async function checkAndDeductCredit(
  userId: string
): Promise<{ ok: boolean; error?: string; source?: "tier" | "credit" }> {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Reset once per billing month. The guarded update is safe under concurrency.
    await tx.user.updateMany({
      where: {
        id: userId,
        OR: [
          { tierResetAt: { lt: monthStart } },
          { tierResetAt: { gte: nextMonthStart } },
        ],
      },
      data: { tierUsedThisMonth: 0, tierResetAt: now },
    });

    // Repair values created by the former public refund endpoint.
    await tx.user.updateMany({
      where: { id: userId, tierUsedThisMonth: { lt: 0 } },
      data: { tierUsedThisMonth: 0 },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true },
    });

    const monthlyLimit = TIER_LIMITS[user.tier] ?? 5;

    // Unlimited tiers still track usage, but need no conditional allowance check.
    if (monthlyLimit === Infinity) {
      await tx.user.update({
        where: { id: userId },
        data: { tierUsedThisMonth: { increment: 1 } },
      });
      return { ok: true, source: "tier" };
    }

    // The predicate and increment run in one statement, so the last allowance
    // cannot be consumed by two concurrent requests.
    if (monthlyLimit > 0) {
      const tierDeduction = await tx.user.updateMany({
        where: { id: userId, tierUsedThisMonth: { lt: monthlyLimit } },
        data: { tierUsedThisMonth: { increment: 1 } },
      });
      if (tierDeduction.count === 1) {
        return { ok: true, source: "tier" };
      }
    }

    const creditDeduction = await tx.user.updateMany({
      where: { id: userId, credits: { gt: 0 } },
      data: { credits: { decrement: 1 } },
    });
    if (creditDeduction.count === 1) {
      return { ok: true, source: "credit" };
    }

    return {
      ok: false,
      error: "크레딧이 부족합니다. 관리자에게 문의하세요.",
    };
  });
}

export async function refundDeductedCredit(
  userId: string,
  source: "tier" | "credit" | undefined
): Promise<void> {
  if (!source) return;

  if (source === "tier") {
    await prisma.user.updateMany({
      where: { id: userId, tierUsedThisMonth: { gt: 0 } },
      data: { tierUsedThisMonth: { decrement: 1 } },
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: 1 } },
  });
}

export async function reserveJobCredit(
  userId: string,
  jobId: string
): Promise<{ ok: boolean; error?: string; source?: "tier" | "credit" }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.generationJob.findFirst({
      where: { id: jobId, userId },
      select: { id: true, creditSource: true },
    });
    if (!job) return { ok: false, error: "생성 작업을 찾을 수 없습니다." };

    const existingCharge = await tx.creditLedger.findUnique({
      where: { jobId_action: { jobId, action: "charge" } },
    });
    if (existingCharge) {
      return {
        ok: true,
        source: existingCharge.source as "tier" | "credit",
      };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await tx.user.updateMany({
      where: {
        id: userId,
        OR: [
          { tierResetAt: { lt: monthStart } },
          { tierResetAt: { gte: nextMonthStart } },
        ],
      },
      data: { tierUsedThisMonth: 0, tierResetAt: now },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true },
    });
    const monthlyLimit = TIER_LIMITS[user.tier] ?? 5;
    let source: "tier" | "credit" | undefined;

    if (monthlyLimit === Infinity) {
      await tx.user.update({
        where: { id: userId },
        data: { tierUsedThisMonth: { increment: 1 } },
      });
      source = "tier";
    } else if (monthlyLimit > 0) {
      const tierDeduction = await tx.user.updateMany({
        where: { id: userId, tierUsedThisMonth: { lt: monthlyLimit } },
        data: { tierUsedThisMonth: { increment: 1 } },
      });
      if (tierDeduction.count === 1) source = "tier";
    }

    if (!source) {
      const creditDeduction = await tx.user.updateMany({
        where: { id: userId, credits: { gt: 0 } },
        data: { credits: { decrement: 1 } },
      });
      if (creditDeduction.count === 1) source = "credit";
    }

    if (!source) {
      return { ok: false, error: "크레딧이 부족합니다. 관리자에게 문의하세요." };
    }

    await tx.generationJob.update({
      where: { id: jobId },
      data: { creditSource: source },
    });
    await tx.creditLedger.create({
      data: { userId, jobId, action: "charge", source, units: 1 },
    });
    return { ok: true, source };
  });
}

export async function refundJobCredit(
  jobId: string,
  note?: string,
  transaction?: Prisma.TransactionClient
): Promise<void> {
  const refund = async (tx: Prisma.TransactionClient) => {
    const job = await tx.generationJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true, creditSource: true },
    });
    if (!job?.creditSource) return;

    const existingRefund = await tx.creditLedger.findUnique({
      where: { jobId_action: { jobId, action: "refund" } },
    });
    if (existingRefund) return;

    await tx.creditLedger.create({
      data: {
        userId: job.userId,
        jobId,
        action: "refund",
        source: job.creditSource,
        units: 1,
        note,
      },
    });

    if (job.creditSource === "tier") {
      await tx.user.updateMany({
        where: { id: job.userId, tierUsedThisMonth: { gt: 0 } },
        data: { tierUsedThisMonth: { decrement: 1 } },
      });
    } else {
      await tx.user.update({
        where: { id: job.userId },
        data: { credits: { increment: 1 } },
      });
    }
  };

  if (transaction) {
    await refund(transaction);
    return;
  }
  await prisma.$transaction(refund);
}
