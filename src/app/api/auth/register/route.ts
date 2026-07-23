import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthEmailConfigured, sendVerificationEmail } from "@/lib/auth-email";
import { createAuthToken, hashAuthToken } from "@/lib/auth-tokens";
import { validatePassword } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const requestedName = typeof body.name === "string" ? body.name.trim() : "";

    if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "올바른 이메일 주소를 입력해주세요." }, { status: 400 });
    }
    if (requestedName.length > 80) {
      return NextResponse.json({ error: "이름은 80자 이하로 입력해주세요." }, { status: 400 });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    if (!isAuthEmailConfigured()) {
      return NextResponse.json(
        { error: "이메일 발송 설정을 확인해주세요." },
        { status: 503 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      const canResend = !existing.emailVerified
        && !existing.kakaoId
        && !existing.googleId
        && await bcrypt.compare(password, existing.passwordHash);
      if (!canResend) {
        return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
      }

      const token = createAuthToken();
      const previous = {
        verifyToken: existing.verifyToken,
        verifyTokenExp: existing.verifyTokenExp,
      };
      const verifyToken = hashAuthToken(token);
      const verifyTokenExp = new Date(Date.now() + VERIFY_TTL_MS);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          verifyToken,
          verifyTokenExp,
          ...(requestedName ? { name: requestedName } : {}),
        },
      });
      try {
        await sendVerificationEmail({ email: existing.email, token });
      } catch (error) {
        await prisma.user.update({ where: { id: existing.id }, data: previous });
        throw error;
      }
      return NextResponse.json({ message: "인증 메일을 다시 보냈습니다." });
    }

    const token = createAuthToken();
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: requestedName || email.split("@")[0],
        emailVerified: false,
        verifyToken: hashAuthToken(token),
        verifyTokenExp: new Date(Date.now() + VERIFY_TTL_MS),
      },
      select: { id: true, email: true },
    });

    try {
      await sendVerificationEmail({ email: created.email, token });
    } catch (error) {
      await prisma.user.deleteMany({
        where: { id: created.id, emailVerified: false, welcomeCreditsGrantedAt: null },
      });
      throw error;
    }

    return NextResponse.json(
      { message: "인증 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해주세요." },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "회원가입 메일을 보내지 못했습니다." }, { status: 502 });
  }
}
