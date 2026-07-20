import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import {
  canManageAccountWithoutPassword,
  hasOAuthIdentity,
} from "@/lib/account-auth";
import { AuthError, requireAuth } from "@/lib/auth";
import { createCreditLedgerWithAudit } from "@/lib/credit-audit";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth();

    let body: { password?: unknown; emailConfirmation?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const password = typeof body.password === "string" ? body.password : "";
    const emailConfirmation =
      typeof body.emailConfirmation === "string"
        ? body.emailConfirmation.trim().toLowerCase()
        : "";

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      session.destroy();
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const canSkipPassword = canManageAccountWithoutPassword(
      session.authMethod,
      hasOAuthIdentity(user)
    );

    if (!emailConfirmation || (!canSkipPassword && !password)) {
      return NextResponse.json(
        { error: "현재 비밀번호와 이메일을 모두 입력해주세요." },
        { status: 400 }
      );
    }
    if (password && new TextEncoder().encode(password).length > 72) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
    }

    if (emailConfirmation !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "확인용 이메일이 현재 계정과 일치하지 않습니다." },
        { status: 400 }
      );
    }

    const now = new Date();
    if (!canSkipPassword) {
      const primaryMatches = await bcrypt.compare(password, user.passwordHash);
      const temporaryMatches = Boolean(
        !primaryMatches &&
          user.temporaryPasswordHash &&
          user.temporaryPasswordExpiresAt &&
          user.temporaryPasswordExpiresAt > now &&
          (await bcrypt.compare(password, user.temporaryPasswordHash))
      );
      if (!primaryMatches && !temporaryMatches) {
        return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
      }
    }

    const disabledPasswordHash = await bcrypt.hash(randomUUID(), 12);
    const deletedEmail = `deleted-${user.id}-${now.getTime()}@deleted.invalid`;

    await prisma.$transaction(async (tx) => {
      await tx.instagramAccount.deleteMany({ where: { userId: user.id } });
      await tx.characterPreset.updateMany({
        where: { userId: user.id },
        data: { isPublic: false, isDefault: false },
      });
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: deletedEmail,
          kakaoId: null,
          googleId: null,
          passwordHash: disabledPasswordHash,
          name: "탈퇴한 사용자",
          plazaNickname: null,
          role: "user",
          tier: "free",
          credits: 0,
          tierUsedThisMonth: 0,
          tierResetAt: now,
          emailVerified: false,
          verifyToken: null,
          verifyTokenExp: null,
          temporaryPasswordHash: null,
          temporaryPasswordExpiresAt: null,
          temporaryPasswordIssuedAt: null,
          passwordChangedAt: now,
        },
      });
      const referenceId = `account-withdrawal:${user.id}:${now.getTime()}`;
      await createCreditLedgerWithAudit(tx, {
        userId: user.id,
        actorUserId: user.id,
        referenceKey: `${referenceId}:adjustment`,
        referenceId,
        action: "adjustment",
        direction: user.credits > 0 ? "debit" : "neutral",
        source: "account-withdrawal",
        units: user.credits,
        balanceBefore: user.credits,
        balanceAfter: 0,
        note: "회원 탈퇴에 따른 잔액 정리",
        reasonCode: "ACCOUNT_WITHDRAWAL_BALANCE_CLOSED",
      });
    });

    session.destroy();
    return NextResponse.json({ message: "계정 탈퇴가 완료되었습니다." });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Account withdrawal error:", error);
    return NextResponse.json({ error: "계정 탈퇴에 실패했습니다." }, { status: 500 });
  }
}
