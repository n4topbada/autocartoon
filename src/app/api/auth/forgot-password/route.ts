import { NextRequest, NextResponse } from "next/server";
import { issueTemporaryPassword } from "@/lib/password-reset";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE =
  "등록된 계정이면 임시 비밀번호를 이메일로 보냈습니다. 메일함을 확인해주세요.";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "올바른 이메일 주소를 입력해주세요." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const status = await issueTemporaryPassword(email);
    if (status === "email_unavailable" || status === "email_failed") {
      console.error("Temporary password request could not send email:", status);
    }

    return NextResponse.json(
      { message: GENERIC_MESSAGE },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { message: GENERIC_MESSAGE },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
