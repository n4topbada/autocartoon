import "server-only";

import bcrypt from "bcryptjs";
import { sendPasswordResetEmail, isAuthEmailConfigured } from "./auth-email";
import { createAuthToken, hashAuthToken, isAuthTokenShape } from "./auth-tokens";
import { prisma } from "./prisma";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const ISSUE_COOLDOWN_MS = 60 * 1000;

export type PasswordResetIssueStatus =
  | "sent"
  | "not_found"
  | "rate_limited"
  | "email_unavailable"
  | "email_failed";

export type PasswordResetStatus = "reset" | "invalid" | "expired";

export async function issuePasswordResetLink(
  email: string
): Promise<PasswordResetIssueStatus> {
  if (!isAuthEmailConfigured()) return "email_unavailable";

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      emailVerified: true,
      kakaoId: null,
      googleId: null,
    },
    select: {
      id: true,
      email: true,
      passwordResetTokenHash: true,
      passwordResetTokenExpiresAt: true,
      passwordResetRequestedAt: true,
    },
  });
  if (!user) return "not_found";

  const requestedAt = new Date();
  const cooldownCutoff = new Date(requestedAt.getTime() - ISSUE_COOLDOWN_MS);
  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [
        { passwordResetRequestedAt: null },
        { passwordResetRequestedAt: { lt: cooldownCutoff } },
      ],
    },
    data: { passwordResetRequestedAt: requestedAt },
  });
  if (claimed.count === 0) return "rate_limited";

  const token = createAuthToken();
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(requestedAt.getTime() + RESET_TOKEN_TTL_MS);
  const stored = await prisma.user.updateMany({
    where: {
      id: user.id,
      kakaoId: null,
      googleId: null,
      passwordResetRequestedAt: requestedAt,
    },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
    },
  });
  if (stored.count === 0) return "not_found";

  try {
    const emailId = await sendPasswordResetEmail({ email: user.email, token });
    console.info("Password reset email accepted", { emailId });
    return "sent";
  } catch (error) {
    await prisma.user.updateMany({
      where: { id: user.id, passwordResetRequestedAt: requestedAt },
      data: {
        passwordResetTokenHash: user.passwordResetTokenHash,
        passwordResetTokenExpiresAt: user.passwordResetTokenExpiresAt,
        passwordResetRequestedAt: user.passwordResetRequestedAt,
      },
    });
    console.error("Password reset email failed:", error);
    return "email_failed";
  }
}

export async function resetPasswordWithToken(
  token: unknown,
  newPassword: string
): Promise<PasswordResetStatus> {
  if (!isAuthTokenShape(token)) return "invalid";

  const tokenHash = hashAuthToken(token);
  const user = await prisma.user.findUnique({
    where: { passwordResetTokenHash: tokenHash },
    select: {
      id: true,
      passwordResetTokenExpiresAt: true,
      kakaoId: true,
      googleId: true,
    },
  });
  if (!user || user.kakaoId || user.googleId) return "invalid";

  const now = new Date();
  if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt <= now) {
    await prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash },
      data: {
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequestedAt: null,
      },
    });
    return "expired";
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const reset = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: {
        id: user.id,
        kakaoId: null,
        googleId: null,
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: { gt: now },
      },
      data: {
        passwordHash,
        passwordChangedAt: now,
        emailVerified: true,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequestedAt: null,
        temporaryPasswordHash: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordIssuedAt: null,
      },
    });
    if (changed.count !== 1) return false;
    await tx.userSession.deleteMany({ where: { userId: user.id } });
    return true;
  });

  return reset ? "reset" : "invalid";
}
