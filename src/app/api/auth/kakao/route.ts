import { NextRequest, NextResponse } from "next/server";
import {
  createKakaoOAuthState,
  getKakaoAuthorizeUrl,
  isKakaoLoginConfigured,
  KAKAO_OAUTH_STATE_COOKIE,
  KAKAO_OAUTH_STATE_MAX_AGE,
} from "@/lib/kakao-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isKakaoLoginConfigured()) {
    return NextResponse.redirect(new URL("/login?kakao=not_configured", req.url));
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
  return response;
}
