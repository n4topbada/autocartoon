import { prisma } from "./prisma";
import { TIER_LIMITS } from "./tier-config";

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
