import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getInstagramAccount,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  validateOAuthState,
} from "@/lib/instagram";

function redirectAndClearOAuthState(req: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, req.url));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const searchParams = new URL(req.url).searchParams;
    const returnedState = searchParams.get("state");
    const expectedState = req.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value ?? null;
    if (!validateOAuthState(returnedState, expectedState)) {
      return redirectAndClearOAuthState(req, "/?ig_error=invalid_state");
    }

    if (searchParams.get("error")) {
      return redirectAndClearOAuthState(req, "/?ig_error=access_denied");
    }

    const code = searchParams.get("code");
    if (!code) {
      return redirectAndClearOAuthState(req, "/?ig_error=no_code");
    }

    // 1. Code → Short-lived token
    const { accessToken: shortToken } = await exchangeCodeForToken(code);

    // 2. Short → Long-lived token
    const { accessToken, expiresIn } = await getLongLivedToken(shortToken);

    // 3. Get Instagram Business Account
    const igAccount = await getInstagramAccount(accessToken);
    if (!igAccount) {
      return redirectAndClearOAuthState(req, "/?ig_error=no_business_account");
    }

    // 4. Save to DB (upsert)
    await prisma.instagramAccount.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        igUserId: igAccount.igUserId,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        username: igAccount.username,
        profilePicture: igAccount.profilePicture,
      },
      update: {
        igUserId: igAccount.igUserId,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        username: igAccount.username,
        profilePicture: igAccount.profilePicture,
      },
    });

    return redirectAndClearOAuthState(req, "/?ig_connected=true");
  } catch (error) {
    console.error("Instagram callback error:", error);
    if (error instanceof AuthError) {
      return redirectAndClearOAuthState(req, "/login");
    }
    return redirectAndClearOAuthState(req, "/?ig_error=auth_failed");
  }
}
