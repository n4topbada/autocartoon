import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import {
  createKakaoOAuthState,
  getKakaoAuthorizeUrl,
  isKakaoLoginConfigured,
  KAKAO_OAUTH_INTENT_COOKIE,
  KAKAO_OAUTH_STATE_COOKIE,
  KAKAO_OAUTH_STATE_MAX_AGE,
} from "@/lib/kakao-auth";
import { AuthError, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isKakaoLoginConfigured()) {
    return NextResponse.redirect(
      getAppUrl("/login?kakao=not_configured", req.nextUrl.origin)
    );
  }

  const intent = req.nextUrl.searchParams.get("intent") === "link" ? "link" : "login";
  if (intent === "link") {
    try {
      await requireAuth();
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.redirect(
          getAppUrl("/login?kakao=link_login_required", req.nextUrl.origin)
        );
      }
      throw error;
    }
  }

  const state = createKakaoOAuthState();
  const response = NextResponse.redirect(getKakaoAuthorizeUrl(req.nextUrl.origin, state));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(KAKAO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KAKAO_OAUTH_STATE_MAX_AGE,
  });
  response.cookies.set(KAKAO_OAUTH_INTENT_COOKIE, intent, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KAKAO_OAUTH_STATE_MAX_AGE,
  });
  return response;
}
