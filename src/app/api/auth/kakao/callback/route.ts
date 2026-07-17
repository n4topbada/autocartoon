import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import {
  getKakaoUser,
  KAKAO_OAUTH_STATE_COOKIE,
  kakaoPlaceholderEmail,
  validateKakaoOAuthState,
} from "@/lib/kakao-auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUserSession } from "@/lib/user-sessions";

export const dynamic = "force-dynamic";

function redirectAndClearState(req: NextRequest, path: string) {
  const response = NextResponse.redirect(getAppUrl(path, req.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(KAKAO_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(KAKAO_OAUTH_STATE_COOKIE)?.value ?? null;
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!validateKakaoOAuthState(returnedState, expectedState)) {
    return redirectAndClearState(req, "/login?kakao=invalid_state");
  }
  if (req.nextUrl.searchParams.get("error")) {
    return redirectAndClearState(req, "/login?kakao=access_denied");
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return redirectAndClearState(req, "/login?kakao=missing_code");

  try {
    const kakao = await getKakaoUser(code, req.nextUrl.origin);
    let user = await prisma.user.findUnique({ where: { kakaoId: kakao.id } });

    if (!user && kakao.verifiedEmail) {
      const matchingUser = await prisma.user.findFirst({
        where: { email: { equals: kakao.verifiedEmail, mode: "insensitive" } },
      });
      if (matchingUser?.kakaoId && matchingUser.kakaoId !== kakao.id) {
        return redirectAndClearState(req, "/login?kakao=already_linked");
      }
      if (matchingUser && !matchingUser.kakaoId) {
        if (matchingUser.emailVerified) {
          // 기존 계정 주인이 이미 이메일 소유권을 증명한 경우에만 조용히 연결한다.
          user = await prisma.user.update({
            where: { id: matchingUser.id },
            data: { kakaoId: kakao.id },
          });
        } else {
          // 미인증(소유권 미증명) 계정은 사전 선점 공격의 대상일 수 있다.
          // 카카오가 실제 이메일 소유권을 증명했으므로 진짜 주인이 계정을 회수한다:
          // 카카오 연결 + 인증 처리 + 기존 비밀번호 무효화(선점된 비밀번호 차단).
          const rotatedPasswordHash = await bcrypt.hash(
            randomBytes(32).toString("base64url"),
            12
          );
          user = await prisma.user.update({
            where: { id: matchingUser.id },
            data: {
              kakaoId: kakao.id,
              emailVerified: true,
              passwordHash: rotatedPasswordHash,
              temporaryPasswordHash: null,
              temporaryPasswordExpiresAt: null,
              temporaryPasswordIssuedAt: null,
            },
          });
        }
      }
    }

    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            kakaoId: kakao.id,
            email: kakao.verifiedEmail ?? kakaoPlaceholderEmail(kakao.id),
            passwordHash,
            name: kakao.nickname,
            emailVerified: Boolean(kakao.verifiedEmail),
            credits: WELCOME_CREDITS,
            welcomeCreditsGrantedAt: new Date(),
          },
        });
        await tx.creditLedger.create({
          data: {
            userId: created.id,
            referenceKey: `welcome:${created.id}:grant`,
            action: "grant",
            source: "welcome",
            units: WELCOME_CREDITS,
            balanceAfter: WELCOME_CREDITS,
            note: "카카오 신규 가입 웰컴 크레딧",
          },
        });
        return created;
      });
    }

    const session = await getSession();
    if (session.sessionId) {
      await prisma.userSession.deleteMany({ where: { id: session.sessionId } });
    }
    const registeredSession = await createUserSession(
      user.id,
      req.headers.get("user-agent") || ""
    );
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role;
    session.sessionId = registeredSession.id;
    session.usedTemporaryPassword = false;
    await session.save();

    return redirectAndClearState(req, "/");
  } catch (error) {
    console.error("Kakao login callback error:", error);
    return redirectAndClearState(req, "/login?kakao=failed");
  }
}
