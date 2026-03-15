import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/lib/tier-config";

export async function GET() {
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json(null);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tier: true,
      credits: true,
      tierUsedThisMonth: true,
      tierResetAt: true,
    },
  });

  if (!user) {
    session.destroy();
    return NextResponse.json(null);
  }

  // 월간 리셋 체크
  const now = new Date();
  const resetDate = new Date(user.tierResetAt);
  let tierUsed = user.tierUsedThisMonth;

  if (
    now.getMonth() !== resetDate.getMonth() ||
    now.getFullYear() !== resetDate.getFullYear()
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tierUsedThisMonth: 0, tierResetAt: now },
    });
    tierUsed = 0;
  }

  const monthlyLimit = TIER_LIMITS[user.tier] ?? 5;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tier: user.tier,
    credits: user.credits,
    tierUsed,
    tierLimit: monthlyLimit === Infinity ? -1 : monthlyLimit,
  });
}
