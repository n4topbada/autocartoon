import { prisma } from "./prisma";
import { TIER_LIMITS } from "./tier-config";

export async function checkAndDeductCredit(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    // 월간 리셋 체크
    const now = new Date();
    const resetDate = new Date(user.tierResetAt);
    let tierUsed = user.tierUsedThisMonth;

    if (
      now.getMonth() !== resetDate.getMonth() ||
      now.getFullYear() !== resetDate.getFullYear()
    ) {
      await tx.user.update({
        where: { id: userId },
        data: { tierUsedThisMonth: 0, tierResetAt: now },
      });
      tierUsed = 0;
    }

    const monthlyLimit = TIER_LIMITS[user.tier] ?? 5;

    // 1) 티어 무료 사용량 우선 차감
    if (tierUsed < monthlyLimit) {
      await tx.user.update({
        where: { id: userId },
        data: { tierUsedThisMonth: { increment: 1 } },
      });
      return { ok: true };
    }

    // 2) 크레딧 차감
    if (user.credits > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: 1 } },
      });
      return { ok: true };
    }

    return {
      ok: false,
      error: "크레딧이 부족합니다. 관리자에게 문의하세요.",
    };
  });
}
