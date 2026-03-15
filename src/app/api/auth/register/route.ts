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

    if (password.length < 4) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상이어야 합니다." },
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
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: email.split("@")[0],
        verifyToken,
        verifyTokenExp,
        emailVerified: false,
      },
    });

    // Resend로 인증 메일 발송
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/api/auth/verify?token=${verifyToken}`;

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "AutoCartoon <noreply@wonyframe.com>",
          to: email,
          subject: "AutoCartoon 이메일 인증",
          html: `
            <h2>AutoCartoon 회원가입을 환영합니다!</h2>
            <p>아래 버튼을 클릭하여 이메일을 인증해주세요.</p>
            <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;">이메일 인증하기</a>
            <p style="margin-top:16px;color:#666;">이 링크는 24시간 동안 유효합니다.</p>
          `,
        });
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
      }
    } else {
      // Resend API 키 없으면 자동 인증 (개발용)
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
      });
      return NextResponse.json({
        message: "회원가입이 완료되었습니다. (개발 모드: 자동 인증됨)",
        autoVerified: true,
      });
    }

    return NextResponse.json({
      message: "회원가입이 완료되었습니다. 이메일을 확인해주세요.",
      autoVerified: false,
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "회원가입 실패" }, { status: 500 });
  }
}
