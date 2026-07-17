import { randomBytes, timingSafeEqual } from "node:crypto";
import { getAppUrl } from "@/lib/app-url";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me";

export const KAKAO_OAUTH_STATE_COOKIE = "wony_kakao_oauth_state";
export const KAKAO_OAUTH_STATE_MAX_AGE = 10 * 60;

const KAKAO_PLACEHOLDER_EMAIL_DOMAIN = "@oauth.wonyframe.local";

export function kakaoPlaceholderEmail(kakaoId: string) {
  return `kakao-${kakaoId}${KAKAO_PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** 이메일 동의 없이 만든 카카오 전용 계정(수신 불가 자리표시 이메일)인지 여부. */
export function isKakaoPlaceholderEmail(email: string) {
  return email.toLowerCase().endsWith(KAKAO_PLACEHOLDER_EMAIL_DOMAIN);
}

export type KakaoUser = {
  id: string;
  nickname: string;
  verifiedEmail: string | null;
};

function getKakaoConfig() {
  return {
    restApiKey: process.env.KAKAO_REST_API_KEY?.trim() ?? "",
    clientSecret: process.env.KAKAO_CLIENT_SECRET?.trim() ?? "",
  };
}

export function isKakaoLoginConfigured() {
  const config = getKakaoConfig();
  return Boolean(config.restApiKey && config.clientSecret);
}

export function getKakaoRedirectUri(origin: string) {
  return getAppUrl("/api/auth/kakao/callback", origin);
}

export function createKakaoOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function validateKakaoOAuthState(returned: string | null, expected: string | null) {
  if (!returned || !expected) return false;
  const returnedBuffer = Buffer.from(returned, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    returnedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(returnedBuffer, expectedBuffer)
  );
}

export function getKakaoAuthorizeUrl(origin: string, state: string) {
  const config = getKakaoConfig();
  if (!config.restApiKey || !config.clientSecret) {
    throw new Error("Kakao Login is not configured.");
  }
  const params = new URLSearchParams({
    client_id: config.restApiKey,
    redirect_uri: getKakaoRedirectUri(origin),
    response_type: "code",
    state,
  });
  return `${KAKAO_AUTHORIZE_URL}?${params}`;
}

export async function getKakaoUser(code: string, origin: string): Promise<KakaoUser> {
  const config = getKakaoConfig();
  if (!config.restApiKey || !config.clientSecret) {
    throw new Error("Kakao Login is not configured.");
  }

  const tokenResponse = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.restApiKey,
      client_secret: config.clientSecret,
      redirect_uri: getKakaoRedirectUri(origin),
      code,
    }),
    cache: "no-store",
  });
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Kakao token exchange failed.");
  }

  const userResponse = await fetch(KAKAO_USER_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const profile = (await userResponse.json()) as {
    id?: number;
    properties?: { nickname?: string };
    kakao_account?: {
      email?: string;
      is_email_valid?: boolean;
      is_email_verified?: boolean;
      profile?: { nickname?: string };
    };
    msg?: string;
  };
  if (!userResponse.ok || profile.id === undefined) {
    throw new Error(profile.msg || "Kakao user lookup failed.");
  }

  const account = profile.kakao_account;
  const emailIsVerified =
    account?.is_email_valid === true && account?.is_email_verified === true;
  return {
    id: String(profile.id),
    nickname:
      account?.profile?.nickname?.trim() || propertiesNickname(profile.properties) || "카카오 사용자",
    verifiedEmail: emailIsVerified ? account?.email?.trim().toLowerCase() || null : null,
  };
}

function propertiesNickname(properties: { nickname?: string } | undefined) {
  return properties?.nickname?.trim() || "";
}
