import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { sendKakaoNotification } from "@/lib/kakao-notify";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const WONY_EMAIL = "wony@wonyframe.com";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { message } = body as { message: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });
    }

    const user = await getCurrentUser();
    const userName = user?.name || user?.email?.split("@")[0] || "사용자";

    // DB에 도움 요청 저장
    await prisma.helpRequest.create({
      data: {
        userId: session.userId,
        message: message.trim(),
      },
    });

    // 이메일 발송 (Resend)
    let emailSent = false;
    if (resend) {
      try {
        await resend.emails.send({
          from: "Autocartoon Bot <onboarding@resend.dev>",
          to: WONY_EMAIL,
          subject: `[도움 요청] ${userName} 님이 도움을 요청합니다`,
          html: `
            <h2>도움 요청</h2>
            <p><strong>사용자:</strong> ${userName} (${user?.email})</p>
            <p><strong>티어:</strong> ${user?.tier}</p>
            <p><strong>메시지:</strong></p>
            <blockquote style="border-left: 3px solid #7c3aed; padding: 12px; background: #f5f3ff;">
              ${message.trim().replace(/\n/g, "<br>")}
            </blockquote>
            <p style="color: #666; font-size: 12px;">워니의 Autocartoon Bot에서 발송됨</p>
          `,
        });
        emailSent = true;
      } catch (err) {
        console.error("[Help] 이메일 발송 실패:", err);
      }
    }

    // 카카오톡 알림톡 발송 (환경변수 설정 시)
    const kakaoResult = await sendKakaoNotification("help_request", {
      "#{사용자명}": userName,
      "#{메시지내용}": message.trim().slice(0, 100),
    });

    return NextResponse.json({
      ok: true,
      emailSent,
      kakaoSent: kakaoResult.success,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Help] 오류:", error);
    return NextResponse.json({ error: "도움 요청 중 오류 발생" }, { status: 500 });
  }
}
