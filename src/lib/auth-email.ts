import "server-only";

import { Resend } from "resend";
import { getAppOrigin } from "./app-url";

const DEFAULT_FROM = "워니바나나봇 <onboarding@resend.dev>";

function emailClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  return new Resend(apiKey);
}

function sender() {
  return process.env.AUTH_EMAIL_FROM?.trim()
    || process.env.PASSWORD_EMAIL_FROM?.trim()
    || DEFAULT_FROM;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const result = await emailClient().emails.send({
    from: sender(),
    ...input,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data?.id ?? null;
}

export function isAuthEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendVerificationEmail(input: {
  email: string;
  token: string;
}) {
  const url = new URL("/api/auth/verify", getAppOrigin());
  url.searchParams.set("token", input.token);
  const verificationUrl = url.toString();
  return sendEmail({
    to: input.email,
    subject: "[워니바나나봇] 이메일 인증",
    text: `워니바나나봇 이메일 인증 링크입니다.\n\n${verificationUrl}\n\n이 링크는 24시간 동안 유효합니다.`,
    html: `<p>아래 버튼을 눌러 이메일 인증을 완료해주세요.</p><p><a href="${verificationUrl}">이메일 인증하기</a></p><p>이 링크는 24시간 동안 유효합니다.</p>`,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  token: string;
}) {
  const resetUrl = `${getAppOrigin()}/reset-password#token=${encodeURIComponent(input.token)}`;
  return sendEmail({
    to: input.email,
    subject: "[워니바나나봇] 비밀번호 재설정",
    text: `비밀번호 재설정 링크입니다.\n\n${resetUrl}\n\n이 링크는 30분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해주세요.`,
    html: `<p>아래 버튼을 눌러 새 비밀번호를 설정해주세요.</p><p><a href="${resetUrl}">비밀번호 재설정하기</a></p><p>이 링크는 30분 동안 한 번만 사용할 수 있습니다.</p>`,
  });
}
