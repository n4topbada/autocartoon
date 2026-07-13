import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  createOAuthState,
  getAuthUrl,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_MAX_AGE,
} from "@/lib/instagram";

export async function GET() {
  try {
    await requireAuth();
    const state = createOAuthState();
    const response = NextResponse.json({ url: getAuthUrl(state) });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/instagram/callback",
      maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "인증 URL 생성 실패" }, { status: 500 });
  }
}
