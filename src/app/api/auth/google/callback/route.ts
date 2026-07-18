import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { addReturnTo, normalizeReturnTo } from "@/lib/auth-navigation";
import { AuthError, requireAuth } from "@/lib/auth";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import {
  getGoogleUser,
  GOOGLE_OAUTH_INTENT_COOKIE,
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  validateGoogleOAuthState,
} from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { SignupLimitError, reserveNewAccountSlot } from "@/lib/signup-guard";
import { createUserSession } from "@/lib/user-sessions";

export const dynamic = "force-dynamic";

function redirectAndClearState(req: NextRequest, path: string) {
  const response = NextResponse.redirect(getAppUrl(path, req.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  for (const name of [
    GOOGLE_OAUTH_STATE_COOKIE,
    GOOGLE_OAUTH_VERIFIER_COOKIE,
    GOOGLE_OAUTH_RETURN_TO_COOKIE,
    GOOGLE_OAUTH_INTENT_COOKIE,
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

async function linkGoogleToCurrentAccount(googleId: string) {
  const session = await requireAuth();
  const disabledPasswordHash = await bcrypt.hash(
    randomBytes(32).toString("base64url"),
    12,
  );
  const result = await prisma.$transaction(async (tx) => {
    const [target, linked] = await Promise.all([
      tx.user.findUnique({ where: { id: session.userId } }),
      tx.user.findUnique({ where: { googleId } }),
    ]);
    if (!target) throw new AuthError("로그인 계정을 찾을 수 없습니다.", 401);
    if (target.googleId && target.googleId !== googleId) {
      return "different_google" as const;
    }
    if (linked && linked.id !== target.id) {
      return "account_has_data" as const;
    }

    await tx.user.update({
      where: { id: target.id },
      data: {
        googleId,
        passwordHash: disabledPasswordHash,
        temporaryPasswordHash: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordIssuedAt: null,
      },
    });
    if (session.sessionId) {
      await tx.userSession.deleteMany({
        where: { userId: target.id, id: { not: session.sessionId } },
      });
    }
    return "linked" as const;
  }, { isolationLevel: "Serializable" });

  if (result === "linked") {
    session.usedTemporaryPassword = false;
    session.authMethod = "google";
    await session.save();
  }
  return result;
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? null;
  const verifier = req.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value ?? null;
  const returnTo = normalizeReturnTo(
    req.cookies.get(GOOGLE_OAUTH_RETURN_TO_COOKIE)?.value,
  );
  const intent =
    req.cookies.get(GOOGLE_OAUTH_INTENT_COOKIE)?.value === "link" ? "link" : "login";
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!validateGoogleOAuthState(returnedState, expectedState) || !verifier) {
    return redirectAndClearState(
      req,
      addReturnTo("/login?google=invalid_state", returnTo),
    );
  }
  if (req.nextUrl.searchParams.get("error")) {
    return redirectAndClearState(
      req,
      addReturnTo("/login?google=access_denied", returnTo),
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectAndClearState(
      req,
      addReturnTo("/login?google=missing_code", returnTo),
    );
  }

  try {
    const google = await getGoogleUser(code, req.nextUrl.origin, verifier);
    if (intent === "link") {
      try {
        const result = await linkGoogleToCurrentAccount(google.id);
        return redirectAndClearState(
          req,
          result === "linked"
            ? "/?tab=settings&google=linked"
            : `/?tab=settings&google=${result === "different_google" ? "different_google" : "link_conflict"}`,
        );
      } catch (error) {
        if (error instanceof AuthError) {
          return redirectAndClearState(req, "/login?google=link_login_required");
        }
        throw error;
      }
    }

    let migratedFromPassword = false;
    let user = await prisma.user.findUnique({ where: { googleId: google.id } });

    if (!user) {
      const matchingUser = await prisma.user.findFirst({
        where: { email: { equals: google.email, mode: "insensitive" } },
      });
      if (matchingUser?.googleId && matchingUser.googleId !== google.id) {
        return redirectAndClearState(
          req,
          addReturnTo("/login?google=already_linked", returnTo),
        );
      }
      if (matchingUser && !matchingUser.googleId) {
        migratedFromPassword = !matchingUser.kakaoId;
        const rotatedPasswordHash = await bcrypt.hash(
          randomBytes(32).toString("base64url"),
          12,
        );
        user = await prisma.user.update({
          where: { id: matchingUser.id },
          data: {
            googleId: google.id,
            emailVerified: true,
            passwordHash: rotatedPasswordHash,
            temporaryPasswordHash: null,
            temporaryPasswordExpiresAt: null,
            temporaryPasswordIssuedAt: null,
          },
        });
      }
    }

    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
      user = await prisma.$transaction(async (tx) => {
        await reserveNewAccountSlot(tx, req.headers);
        const created = await tx.user.create({
          data: {
            googleId: google.id,
            email: google.email,
            passwordHash,
            name: google.name,
            emailVerified: true,
            credits: WELCOME_CREDITS,
            welcomeCreditsGrantedAt: new Date(),
          },
        });
        await tx.creditLedger.create({
          data: {
            userId: created.id,
            referenceKey: "welcome:" + created.id + ":grant",
            action: "grant",
            source: "welcome",
            units: WELCOME_CREDITS,
            balanceAfter: WELCOME_CREDITS,
            note: "Google 신규 가입 웰컴 크레딧",
          },
        });
        return created;
      });
    }

    const session = await getSession();
    if (migratedFromPassword) {
      await prisma.userSession.deleteMany({ where: { userId: user.id } });
    } else if (session.sessionId) {
      await prisma.userSession.deleteMany({ where: { id: session.sessionId } });
    }
    const registeredSession = await createUserSession(
      user.id,
      req.headers.get("user-agent") || "",
    );
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role;
    session.sessionId = registeredSession.id;
    session.usedTemporaryPassword = false;
    session.authMethod = "google";
    await session.save();

    return redirectAndClearState(req, returnTo);
  } catch (error) {
    if (error instanceof SignupLimitError) {
      return redirectAndClearState(
        req,
        addReturnTo("/login?google=signup_limit", returnTo),
      );
    }
    console.error("Google login callback error:", { host: req.nextUrl.host, error });
    return redirectAndClearState(
      req,
      addReturnTo("/login?google=failed", returnTo),
    );
  }
}
