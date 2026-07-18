import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import {
  canAdminResetPassword,
  normalizeAdminPasswordExpiry,
  validateAdminTemporaryPassword,
} from "@/lib/admin-password-reset";
import { AuthError, requireAdmin } from "@/lib/auth";
import { logError, logEvent } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const temporaryPassword = body.temporaryPassword;
    const passwordError = validateAdminTemporaryPassword(temporaryPassword);
    if (passwordError) {
      return NextResponse.json(
        { error: passwordError },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const expiresInMinutes = normalizeAdminPasswordExpiry(body.expiresInMinutes);
    if (!expiresInMinutes) {
      return NextResponse.json(
        { error: "임시 비밀번호 유효시간이 올바르지 않습니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!canAdminResetPassword(target.email)) {
      return NextResponse.json(
        { error: "카카오·구글 전용 계정은 해당 로그인 제공자에서 복구해야 합니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + expiresInMinutes * 60 * 1000);
    const [temporaryPasswordHash, disabledPasswordHash] = await Promise.all([
      bcrypt.hash(temporaryPassword as string, 12),
      bcrypt.hash(randomBytes(32).toString("base64url"), 12),
    ]);

    const revokedSessions = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          passwordHash: disabledPasswordHash,
          temporaryPasswordHash,
          temporaryPasswordIssuedAt: issuedAt,
          temporaryPasswordExpiresAt: expiresAt,
        },
      });
      const revoked = await tx.userSession.deleteMany({
        where: { userId: target.id },
      });
      return revoked.count;
    });

    logEvent(
      "NOTICE",
      "admin.user.temporary_password_issued",
      "Administrator issued a temporary password",
      {
        adminUserId: admin.userId,
        targetUserId: target.id,
        expiresInMinutes,
        revokedSessions,
        selfReset: admin.userId === target.id,
      },
      req
    );

    return NextResponse.json(
      {
        ok: true,
        email: target.email,
        expiresAt: expiresAt.toISOString(),
        revokedSessions,
        selfReset: admin.userId === target.id,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    logError(
      "admin.user.temporary_password_failed",
      "Administrator temporary password issue failed",
      error,
      {},
      req
    );
    return NextResponse.json(
      { error: "임시 비밀번호를 설정하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
