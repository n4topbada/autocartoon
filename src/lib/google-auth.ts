import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getAppUrl } from "@/lib/app-url";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_OAUTH_STATE_COOKIE = "wony_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "wony_google_oauth_verifier";
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = "wony_google_oauth_return_to";
export const GOOGLE_OAUTH_INTENT_COOKIE = "wony_google_oauth_intent";
export const GOOGLE_OAUTH_STATE_MAX_AGE = 10 * 60;

export type GoogleUser = {
  id: string;
  email: string;
  name: string;
};

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
  };
}

export function isGoogleLoginConfigured() {
  const config = getGoogleConfig();
  return Boolean(config.clientId && config.clientSecret);
}

function getGoogleRedirectUri(origin: string) {
  return getAppUrl("/api/auth/google/callback", origin);
}

export function createGoogleOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createGoogleCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

export function validateGoogleOAuthState(returned: string | null, expected: string | null) {
  if (!returned || !expected) return false;
  const returnedBuffer = Buffer.from(returned, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    returnedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(returnedBuffer, expectedBuffer)
  );
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function getGoogleAuthorizeUrl(origin: string, state: string, verifier: string) {
  const config = getGoogleConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google Login is not configured.");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getGoogleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params}`;
}

export async function getGoogleUser(
  code: string,
  origin: string,
  verifier: string,
): Promise<GoogleUser> {
  const config = getGoogleConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google Login is not configured.");
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getGoogleRedirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const token = (await tokenResponse.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.id_token) {
    throw new Error(token.error_description || token.error || "Google token exchange failed.");
  }

  const oauthClient = new OAuth2Client(config.clientId);
  const ticket = await oauthClient.verifyIdToken({
    idToken: token.id_token,
    audience: config.clientId,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.trim().toLowerCase();
  if (!payload?.sub || !email || payload.email_verified !== true) {
    throw new Error("A verified Google email address is required.");
  }

  return {
    id: payload.sub,
    email,
    name: payload.name?.trim().slice(0, 120) || email.split("@")[0],
  };
}
