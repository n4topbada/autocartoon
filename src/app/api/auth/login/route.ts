import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

export async function POST(req: NextRequest) {
  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    if (email.length > 320 || new TextEncoder().encode(password).length > 72) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (!user) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const now = new Date();
    const temporaryPasswordActive = Boolean(
      user.temporaryPasswordHash &&
        user.temporaryPasswordExpiresAt &&
        user.temporaryPasswordExpiresAt > now
    );

    let valid = await bcrypt.compare(password, user.passwordHash);
    let usedTemporaryPassword = false;

    if (!valid && temporaryPasswordActive && user.temporaryPasswordHash) {
      valid = await bcrypt.compare(password, user.temporaryPasswordHash);
      usedTemporaryPassword = valid;
    }

    if (!valid) {
      if (user.temporaryPasswordHash && !temporaryPasswordActive) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            temporaryPasswordHash: null,
            temporaryPasswordExpiresAt: null,
            temporaryPasswordIssuedAt: null,
          },
        });
      }
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: "이메일 인증이 필요합니다. 메일을 확인해주세요." },
        { status: 403 }
      );
    }

    if (!usedTemporaryPassword && user.temporaryPasswordHash) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          temporaryPasswordHash: null,
          temporaryPasswordExpiresAt: null,
          temporaryPasswordIssuedAt: null,
        },
      });
    }

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role;
    session.usedTemporaryPassword = usedTemporaryPassword;
    await session.save();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: usedTemporaryPassword,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 500 });
  }
}
