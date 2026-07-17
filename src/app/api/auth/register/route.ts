import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { validatePassword } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import {
  createVerifyToken,
  isEmailVerificationConfigured,
  sendVerificationEmail,
  verifyTokenExpiry,
} from "@/lib/email-verification";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body.password;

    if (!email || typeof password !== "string") {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 409 }
      );
    }

    // 인증 메일을 보낼 수 있으면(운영) 소유권을 증명하기 전까지 미인증 상태로 만든다.
    // Resend 미설정 환경(로컬/개발)에서는 문서화된 대로 자동 인증 처리한다.
    const requireVerification = isEmailVerificationConfigured();
    const verifyToken = requireVerification ? createVerifyToken() : null;
    const verifyTokenExp = verifyToken ? verifyTokenExpiry() : null;

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: email.split("@")[0],
          emailVerified: !requireVerification,
          verifyToken,
          verifyTokenExp,
          credits: WELCOME_CREDITS,
          welcomeCreditsGrantedAt: new Date(),
        },
      });
      await tx.creditLedger.create({
        data: {
          userId: user.id,
          referenceKey: `welcome:${user.id}:grant`,
          action: "grant",
          source: "welcome",
          units: WELCOME_CREDITS,
          balanceAfter: WELCOME_CREDITS,
          note: "신규 가입 웰컴 크레딧",
        },
      });
      return user;
    });

    if (verifyToken) {
      // 메일 발송은 베스트에포트. 실패해도 임시 비밀번호(비밀번호 찾기)로 로그인하면
      // 소유권이 증명되어 인증이 완료되므로 계정이 영구히 잠기지 않는다.
      await sendVerificationEmail({
        email: created.email,
        name: created.name,
        token: verifyToken,
      });
    }

    return NextResponse.json({
      message: requireVerification
        ? "회원가입이 완료되었습니다. 인증 메일을 확인해주세요."
        : "회원가입이 완료되었습니다. 로그인해주세요.",
      autoVerified: !requireVerification,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 409 }
      );
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "회원가입에 실패했습니다." }, { status: 500 });
  }
}
