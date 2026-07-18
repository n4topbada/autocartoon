import { NextResponse } from "next/server";
import { canManageAccountWithoutPassword } from "@/lib/account-auth";
import { AuthError, requireAuth } from "@/lib/auth";
import { isKakaoPlaceholderEmail } from "@/lib/kakao-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message, code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      credits: true,
      kakaoId: true,
      googleId: true,
    },
  });
  if (!user) {
    session.destroy();
    return NextResponse.json(
      { error: "로그인이 필요합니다.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const passwordlessKakaoAccount =
    Boolean(user.kakaoId) && isKakaoPlaceholderEmail(user.email);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    credits: user.credits,
    kakaoLinked: Boolean(user.kakaoId),
    googleLinked: Boolean(user.googleId),
    mustChangePassword: session.usedTemporaryPassword === true,
    canManageAccountWithoutPassword: canManageAccountWithoutPassword(
      session.authMethod,
      passwordlessKakaoAccount
    ),
  });
}
