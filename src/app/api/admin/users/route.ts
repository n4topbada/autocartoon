import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { TIER_LIMITS } from "@/lib/tier-config";

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tier: true,
        credits: true,
        tierUsedThisMonth: true,
        tierResetAt: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      users.map((u) => {
        const limit = TIER_LIMITS[u.tier] ?? 5;
        return {
          ...u,
          tierLimit: limit === Infinity ? -1 : limit,
          createdAt: u.createdAt.toISOString(),
          tierResetAt: u.tierResetAt.toISOString(),
        };
      })
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
