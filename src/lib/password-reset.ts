import "server-only";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { prisma } from "./prisma";

const TEMPORARY_PASSWORD_TTL_MS = 30 * 60 * 1000;
const ISSUE_COOLDOWN_MS = 60 * 1000;
const DEFAULT_FROM = "워니바나나봇 <onboarding@resend.dev>";

export type TemporaryPasswordIssueStatus =
  | "sent"
  | "not_found"
  | "rate_limited"
  | "email_unavailable"
  | "email_failed";

function createTemporaryPassword(): string {
  return `WB-${randomBytes(8).toString("base64url")}-A9!`;
}

export async function issueTemporaryPassword(
  email: string
): Promise<TemporaryPasswordIssueStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "email_unavailable";

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
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

  await prisma.user.update({
    where: { id: user.id },
    data: { temporaryPasswordHash, temporaryPasswordExpiresAt },
  });

  try {
    const resend = new Resend(apiKey);
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://wonybananabot.vercel.app";
    const result = await resend.emails.send({
      from: process.env.PASSWORD_EMAIL_FROM || DEFAULT_FROM,
      to: user.email,
      subject: "[워니바나나봇] 임시 비밀번호 발급",
      text: `${user.name || user.email}님,

임시 비밀번호: ${temporaryPassword}

이 비밀번호는 30분 동안 사용할 수 있습니다.
로그인 후 설정에서 새 비밀번호로 변경해주세요.

로그인: ${appUrl}/login

본인이 요청하지 않았다면 기존 비밀번호는 그대로 유지되므로 이 메일을 무시하세요.`,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
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
