import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { AuthError, getCurrentUser, requireAuth } from "@/lib/auth";
import { sendKakaoNotification } from "@/lib/kakao-notify";
import { prisma } from "@/lib/prisma";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const HELP_EMAIL_TO = "wony@wonyframe.com";
const MAX_MESSAGE_LENGTH = 5_000;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "메시지는 5,000자 이하로 입력해주세요." }, { status: 400 });
    }

    const user = await getCurrentUser();
    const userName = user?.name || user?.email?.split("@")[0] || "사용자";
    await prisma.helpRequest.create({ data: { userId: session.userId, message } });

    let emailSent = false;
    if (resend) {
      try {
        const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
        await resend.emails.send({
          from: process.env.PASSWORD_EMAIL_FROM || "WONY <onboarding@resend.dev>",
          to: HELP_EMAIL_TO,
          subject: `[지원 요청] ${userName}`,
          html: `<h2>지원 요청</h2><p><strong>사용자:</strong> ${escapeHtml(userName)} (${escapeHtml(user?.email || "")})</p><p><strong>크레딧:</strong> ${user?.credits ?? 0}</p><p><strong>메시지:</strong></p><blockquote style="border-left:3px solid #4f46e5;padding:12px;background:#f5f7ff">${safeMessage}</blockquote>`,
        });
        emailSent = true;
      } catch (error) {
        console.error("[Help] Email failed:", error);
      }
    }

    const kakaoResult = await sendKakaoNotification("help_request", {
      "#{사용자명}": userName,
      "#{메시지내용}": message.slice(0, 100),
    });
    return NextResponse.json({ ok: true, emailSent, kakaoSent: kakaoResult.success });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Help] Request failed:", error);
    return NextResponse.json({ error: "지원 요청을 접수하지 못했습니다." }, { status: 500 });
  }
}
