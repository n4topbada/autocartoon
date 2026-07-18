import { NextResponse } from "next/server";
import { canAdminResetPassword } from "@/lib/admin-password-reset";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        credits: true,
        kakaoId: true,
        googleId: true,
        emailVerified: true,
        temporaryPasswordExpiresAt: true,
        createdAt: true,
        _count: { select: { creditPayments: { where: { status: "paid" } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      credits: user.credits,
      kakaoLinked: Boolean(user.kakaoId),
      googleLinked: Boolean(user.googleId),
      emailVerified: user.emailVerified,
      passwordResetEligible: canAdminResetPassword(user),
      temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt?.toISOString() ?? null,
      isCurrentUser: user.id === admin.userId,
      paidPayments: user._count.creditPayments,
      createdAt: user.createdAt.toISOString(),
    })));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "사용자 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
