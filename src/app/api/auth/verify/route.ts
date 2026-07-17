import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUserSession } from "@/lib/user-sessions";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/verify?error=invalid_token", req.url)
    );
  }

  const user = await prisma.user.findUnique({
    where: { verifyToken: token },
  });

  if (!user) {
    return NextResponse.redirect(
      new URL("/verify?error=invalid_token", req.url)
    );
  }

  if (user.verifyTokenExp && new Date() > user.verifyTokenExp) {
    return NextResponse.redirect(
      new URL("/verify?error=token_expired", req.url)
    );
  }

  // 인증 완료
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verifyToken: null,
      verifyTokenExp: null,
    },
  });

  // 자동 로그인
  const session = await getSession();
  const registeredSession = await createUserSession(
    user.id,
    req.headers.get("user-agent") || ""
  );
  session.userId = user.id;
  session.email = user.email;
  session.role = user.role;
  session.sessionId = registeredSession.id;
  session.authMethod = "password";
  await session.save();

  return NextResponse.redirect(new URL("/", req.url));
}
