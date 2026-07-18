import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { addReturnTo, normalizeReturnTo } from "@/lib/auth-navigation";
import {
  createGoogleCodeVerifier,
  createGoogleOAuthState,
  getGoogleAuthorizeUrl,
  GOOGLE_OAUTH_INTENT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE,
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  isGoogleLoginConfigured,
} from "@/lib/google-auth";
import { AuthError, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const returnTo = normalizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  if (!isGoogleLoginConfigured()) {
    return NextResponse.redirect(
      getAppUrl(addReturnTo("/login?google=not_configured", returnTo), req.nextUrl.origin),
    );
  }

  const intent = req.nextUrl.searchParams.get("intent") === "link" ? "link" : "login";
  if (intent === "link") {
    try {
      await requireAuth();
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.redirect(
          getAppUrl("/login?google=link_login_required", req.nextUrl.origin),
        );
      }
      throw error;
    }
  }

  const state = createGoogleOAuthState();
  const verifier = createGoogleCodeVerifier();
  const response = NextResponse.redirect(
    getGoogleAuthorizeUrl(req.nextUrl.origin, state, verifier),
  );
  response.headers.set("Cache-Control", "no-store");
  for (const [name, value] of [
    [GOOGLE_OAUTH_STATE_COOKIE, state],
    [GOOGLE_OAUTH_VERIFIER_COOKIE, verifier],
    [GOOGLE_OAUTH_RETURN_TO_COOKIE, returnTo],
    [GOOGLE_OAUTH_INTENT_COOKIE, intent],
  ] as const) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_OAUTH_STATE_MAX_AGE,
    });
  }
  return response;
}
