import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    let body: { currentPassword?: unknown; newPassword?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "현재 비밀번호와 새 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    if (new TextEncoder().encode(currentPassword).length > 72) {
      return NextResponse.json(
        { error: "현재 비밀번호가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "새 비밀번호는 현재 비밀번호와 달라야 합니다." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      session.destroy();
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const now = new Date();
    const primaryMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    const temporaryMatches = Boolean(
      !primaryMatches &&
        user.temporaryPasswordHash &&
        user.temporaryPasswordExpiresAt &&
        user.temporaryPasswordExpiresAt > now &&
        (await bcrypt.compare(currentPassword, user.temporaryPasswordHash))
    );

    if (!primaryMatches && !temporaryMatches) {
      return NextResponse.json(
        { error: "현재 비밀번호가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "기존 비밀번호와 다른 비밀번호를 사용해주세요." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: now,
        temporaryPasswordHash: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordIssuedAt: null,
      },
    });

    session.usedTemporaryPassword = false;
    await session.save();

    return NextResponse.json({ message: "비밀번호가 변경되었습니다." });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다." },
      { status: 500 }
    );
  }
}
