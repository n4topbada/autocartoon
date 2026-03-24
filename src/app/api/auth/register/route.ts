import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력하세요." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "비밀번호는 8자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "비밀번호는 영문과 숫자를 모두 포함해야 합니다." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: email.split("@")[0],
        emailVerified: true, // 이메일 인증은 추후 활성화 예정
      },
    });

    // TODO: Resend 이메일 인증 활성화 시 아래 주석 해제
    // const verifyToken = crypto.randomBytes(32).toString("hex");
    // const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // ... Resend 발송 로직 ...

    return NextResponse.json({
      message: "회원가입이 완료되었습니다. 로그인해주세요.",
      autoVerified: true,
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "회원가입 실패" }, { status: 500 });
  }
}
