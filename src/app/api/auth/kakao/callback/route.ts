import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { addReturnTo, normalizeReturnTo } from "@/lib/auth-navigation";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import {
  getKakaoUser,
  isKakaoPlaceholderEmail,
  KAKAO_OAUTH_INTENT_COOKIE,
  KAKAO_OAUTH_RETURN_TO_COOKIE,
  KAKAO_OAUTH_STATE_COOKIE,
  kakaoPlaceholderEmail,
  validateKakaoOAuthState,
} from "@/lib/kakao-auth";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUserSession } from "@/lib/user-sessions";
import { isDisposableKakaoPlaceholderAccount } from "@/lib/kakao-account-linking";
import { SignupLimitError, reserveNewAccountSlot } from "@/lib/signup-guard";

export const dynamic = "force-dynamic";

type KakaoCallbackRejection =
  | "invalid_state"
  | "provider_error"
  | "missing_code";

function kakaoClientKind(userAgent: string | null) {
  const value = userAgent ?? "";
  if (/KAKAOTALK/i.test(value)) return "kakaotalk";
  if (/Android/i.test(value)) return "android_browser";
  if (/iPhone|iPad/i.test(value)) return "ios_browser";
  if (/Windows|Macintosh|Linux/i.test(value)) return "desktop_browser";
  return "unknown";
}

function logKakaoCallbackRejection(
  req: NextRequest,
  reason: KakaoCallbackRejection,
  expectedState: string | null,
  returnedState: string | null,
) {
  const providerError = req.nextUrl.searchParams.get("error");
  console.warn("Kakao login callback rejected", {
    reason,
    providerError: providerError?.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) || null,
    hasExpectedState: Boolean(expectedState),
    hasReturnedState: Boolean(returnedState),
    host: req.nextUrl.host,
    client: kakaoClientKind(req.headers.get("user-agent")),
  });
}

function redirectAndClearState(req: NextRequest, path: string) {
  const response = NextResponse.redirect(getAppUrl(path, req.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  for (const name of [
    KAKAO_OAUTH_STATE_COOKIE,
    KAKAO_OAUTH_INTENT_COOKIE,
    KAKAO_OAUTH_RETURN_TO_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

async function canDetachEmptyKakaoAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string,
  credits: number,
) {
  if (!isKakaoPlaceholderEmail(email)) return false;
  const results = await Promise.all([
    tx.characterPreset.count({ where: { userId } }),
    tx.characterGroup.count({ where: { userId } }),
    tx.savedBackground.count({ where: { userId } }),
    tx.generationRequest.count({ where: { userId } }),
    tx.purchasedPreset.count({ where: { userId } }),
    tx.boardPost.count({ where: { userId } }),
    tx.boardComment.count({ where: { userId } }),
    tx.boardLike.count({ where: { userId } }),
    tx.helpRequest.count({ where: { userId } }),
    tx.imageTag.count({ where: { userId } }),
    tx.promptPreset.count({ where: { userId } }),
    tx.content.count({ where: { userId } }),
    tx.generationJob.count({ where: { userId } }),
    tx.creditPayment.count({ where: { userId } }),
    tx.creativeProject.count({ where: { userId } }),
    tx.savedProjectBrief.count({ where: { userId } }),
    tx.report.count({ where: { reporterId: userId } }),
    tx.instagramAccount.count({ where: { userId } }),
    tx.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { action: true, source: true, units: true, balanceAfter: true },
    }),
  ]);
  const ledgers = results.at(-1);
  if (!Array.isArray(ledgers)) return false;
  return isDisposableKakaoPlaceholderAccount({
    credits,
    hasUserData: results.slice(0, -1).some((count) => count !== 0),
    ledgers,
  });
}

async function linkKakaoToCurrentAccount(kakaoId: string) {
  const session = await requireAuth();
  return prisma.$transaction(async (tx) => {
    const [target, linked] = await Promise.all([
      tx.user.findUnique({ where: { id: session.userId } }),
      tx.user.findUnique({ where: { kakaoId } }),
    ]);
    if (!target) throw new AuthError("로그인 계정을 찾을 수 없습니다.", 401);
    if (target.kakaoId && target.kakaoId !== kakaoId) return "different_kakao" as const;
    if (!linked || linked.id === target.id) {
      await tx.user.update({ where: { id: target.id }, data: { kakaoId } });
      return "linked" as const;
    }

    if (!(await canDetachEmptyKakaoAccount(tx, linked.id, linked.email, linked.credits))) {
      return "account_has_data" as const;
    }

    await tx.userSession.deleteMany({ where: { userId: linked.id } });
    await tx.user.update({
      where: { id: linked.id },
      data: {
        kakaoId: null,
        email: `detached-${linked.id}@oauth.wonyframe.local`,
        credits: 0,
      },
    });
    await tx.creditLedger.create({
      data: {
        userId: linked.id,
        referenceKey: `account-link:${linked.id}:deactivate`,
        action: "adjustment",
        source: "account-link",
        units: linked.credits,
        balanceAfter: 0,
        note: "빈 카카오 계정을 기존 이메일 계정에 연결하며 비활성화",
      },
    });
    await tx.user.update({ where: { id: target.id }, data: { kakaoId } });
    return "linked" as const;
  }, { isolationLevel: "Serializable" });
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(KAKAO_OAUTH_STATE_COOKIE)?.value ?? null;
  const intent = req.cookies.get(KAKAO_OAUTH_INTENT_COOKIE)?.value === "link" ? "link" : "login";
  const returnTo = normalizeReturnTo(
    req.cookies.get(KAKAO_OAUTH_RETURN_TO_COOKIE)?.value,
  );
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!validateKakaoOAuthState(returnedState, expectedState)) {
    logKakaoCallbackRejection(req, "invalid_state", expectedState, returnedState);
    return redirectAndClearState(
      req,
      addReturnTo("/login?kakao=invalid_state", returnTo),
    );
  }
  if (req.nextUrl.searchParams.get("error")) {
    logKakaoCallbackRejection(req, "provider_error", expectedState, returnedState);
    return redirectAndClearState(
      req,
      addReturnTo("/login?kakao=access_denied", returnTo),
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    logKakaoCallbackRejection(req, "missing_code", expectedState, returnedState);
    return redirectAndClearState(
      req,
      addReturnTo("/login?kakao=missing_code", returnTo),
    );
  }

  try {
    const kakao = await getKakaoUser(code, req.nextUrl.origin);
    if (intent === "link") {
      try {
        const result = await linkKakaoToCurrentAccount(kakao.id);
        return redirectAndClearState(
          req,
          result === "linked"
            ? "/?tab=settings&kakao=linked"
            : `/?tab=settings&kakao=${result === "different_kakao" ? "different_kakao" : "link_conflict"}`
        );
      } catch (error) {
        if (error instanceof AuthError) {
          return redirectAndClearState(req, "/login?kakao=link_login_required");
        }
        throw error;
      }
    }
    let user = await prisma.user.findUnique({ where: { kakaoId: kakao.id } });

    if (!user && kakao.verifiedEmail) {
      const matchingUser = await prisma.user.findFirst({
        where: { email: { equals: kakao.verifiedEmail, mode: "insensitive" } },
      });
      if (matchingUser?.kakaoId && matchingUser.kakaoId !== kakao.id) {
        return redirectAndClearState(
          req,
          addReturnTo("/login?kakao=already_linked", returnTo),
        );
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
        await reserveNewAccountSlot(tx, req.headers);
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
    session.authMethod = "kakao";
    await session.save();

    return redirectAndClearState(req, returnTo);
  } catch (error) {
    if (error instanceof SignupLimitError) {
      return redirectAndClearState(
        req,
        addReturnTo("/login?kakao=signup_limit", returnTo),
      );
    }
    console.error("Kakao login callback error:", {
      host: req.nextUrl.host,
      client: kakaoClientKind(req.headers.get("user-agent")),
      error,
    });
    return redirectAndClearState(
      req,
      addReturnTo("/login?kakao=failed", returnTo),
    );
  }
}
