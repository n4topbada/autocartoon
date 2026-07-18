import "server-only";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { getAppOrigin } from "./app-url";
import { prisma } from "./prisma";

const TEMPORARY_PASSWORD_TTL_MS = 30 * 60 * 1000;
const ISSUE_COOLDOWN_MS = 60 * 1000;
const DEFAULT_FROM = "워니바나나봇 <onboarding@resend.dev>";
const TEMPORARY_PASSWORD_LENGTH = 12;
const TEMPORARY_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type TemporaryPasswordIssueStatus =
  | "sent"
  | "not_found"
  | "rate_limited"
  | "email_unavailable"
  | "email_failed";

function createTemporaryPassword(): string {
  let password = "";

  do {
    password = Array.from(
      { length: TEMPORARY_PASSWORD_LENGTH },
      () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]
    ).join("");
  } while (!/[A-Z]/.test(password) || !/[0-9]/.test(password));

  return password;
}

export async function issueTemporaryPassword(
  email: string
): Promise<TemporaryPasswordIssueStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "email_unavailable";

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      kakaoId: null,
      googleId: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      temporaryPasswordHash: true,
      temporaryPasswordExpiresAt: true,
      temporaryPasswordIssuedAt: true,
    },
  });
  if (!user) return "not_found";

  const issuedAt = new Date();
  const cooldownCutoff = new Date(issuedAt.getTime() - ISSUE_COOLDOWN_MS);
  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      kakaoId: null,
      googleId: null,
      OR: [
        { temporaryPasswordIssuedAt: null },
        { temporaryPasswordIssuedAt: { lt: cooldownCutoff } },
      ],
    },
    data: { temporaryPasswordIssuedAt: issuedAt },
  });
  if (claimed.count === 0) return "rate_limited";

  const temporaryPassword = createTemporaryPassword();
  const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 12);
  const temporaryPasswordExpiresAt = new Date(
    issuedAt.getTime() + TEMPORARY_PASSWORD_TTL_MS
  );

  const stored = await prisma.user.updateMany({
    where: {
      id: user.id,
      kakaoId: null,
      googleId: null,
      temporaryPasswordIssuedAt: issuedAt,
    },
    data: { temporaryPasswordHash, temporaryPasswordExpiresAt },
  });
  if (stored.count === 0) return "not_found";

  try {
    const resend = new Resend(apiKey);
    const appUrl = getAppOrigin();
    const issueReference = issuedAt.getTime().toString(36).toUpperCase();
    const result = await resend.emails.send({
      from: process.env.PASSWORD_EMAIL_FROM || DEFAULT_FROM,
      to: user.email,
      subject: `[워니바나나봇] 임시 비밀번호 발급 [${issueReference}]`,
      text: `${user.name || user.email}님,

아래 한 줄만 선택해 복사하세요.

${temporaryPassword}

요청 번호: ${issueReference}
이 비밀번호는 30분 동안 사용할 수 있습니다.
여러 번 요청했다면 가장 최근에 받은 비밀번호만 유효합니다.
로그인 후 계정 설정에서 새 비밀번호로 변경하거나 카카오·Google 계정을 연결해주세요.

로그인: ${appUrl}/login

본인이 요청하지 않았다면 기존 비밀번호는 그대로 유지되므로 이 메일을 무시하세요.`,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
    console.info("Temporary password email accepted by Resend", {
      emailId: result.data?.id ?? null,
    });
    return "sent";
  } catch (error) {
    await prisma.user.updateMany({
      where: { id: user.id, temporaryPasswordIssuedAt: issuedAt },
      data: {
        temporaryPasswordHash: user.temporaryPasswordHash,
        temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
        temporaryPasswordIssuedAt: user.temporaryPasswordIssuedAt,
      },
    });
    console.error("Temporary password email failed:", error);
    return "email_failed";
  }
}
