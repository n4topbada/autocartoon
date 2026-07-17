import "server-only";

import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { getAppOrigin } from "./app-url";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FROM = "워니바나나봇 <onboarding@resend.dev>";

export const VERIFY_TOKEN_TTL = VERIFY_TOKEN_TTL_MS;

/**
 * 이메일 인증 메일을 실제로 보낼 수 있는 환경인지 여부.
 * Resend 키가 없으면(로컬/개발) 가입을 자동 인증 처리한다(README 문서화된 동작).
 */
export function isEmailVerificationConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function createVerifyToken() {
  return randomBytes(32).toString("base64url");
}

export function verifyTokenExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + VERIFY_TOKEN_TTL_MS);
}

export async function sendVerificationEmail(params: {
  email: string;
  name: string | null;
  token: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const resend = new Resend(apiKey);
    const appUrl = getAppOrigin();
    const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(params.token)}`;
    const result = await resend.emails.send({
      from: process.env.PASSWORD_EMAIL_FROM || DEFAULT_FROM,
      to: params.email,
      subject: "[워니바나나봇] 이메일 인증을 완료해주세요",
      text: `${params.name || params.email}님,

워니바나나봇 가입을 환영합니다. 아래 링크를 눌러 이메일 인증을 완료하면 로그인할 수 있습니다.

${verifyUrl}

이 링크는 24시간 동안 유효합니다.
본인이 가입하지 않았다면 이 메일을 무시하세요.`,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    console.info("Verification email accepted by Resend", {
      emailId: result.data?.id ?? null,
    });
    return true;
  } catch (error) {
    console.error("Verification email failed:", error);
    return false;
  }
}
