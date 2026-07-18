import { NextRequest, NextResponse } from "next/server";
import { issueTemporaryPassword } from "@/lib/password-reset";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE =
  "복구 대상인 기존 이메일 계정이면 새 임시 비밀번호를 보냈습니다. 가장 최근 메일을 확인해주세요.";

function developmentError(status: Awaited<ReturnType<typeof issueTemporaryPassword>>) {
  if (process.env.NODE_ENV === "production") return null;

  if (status === "email_unavailable") {
    return NextResponse.json(
      { error: "로컬 메일 발송 설정이 없습니다. RESEND_API_KEY를 확인해주세요." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (status === "email_failed") {
    return NextResponse.json(
      { error: "메일 서비스가 요청을 거절했습니다. 서버 로그를 확인해주세요." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (status === "rate_limited") {
    return NextResponse.json(
      { error: "임시 비밀번호는 1분에 한 번 발급할 수 있습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      }
    );
  }

  return null;
}

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
    console.info("Temporary password request completed", { status });

    const localError = developmentError(status);
    if (localError) return localError;

    return NextResponse.json(
      { message: GENERIC_MESSAGE },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        { error: "임시 비밀번호 처리 중 서버 오류가 발생했습니다. 서버 로그를 확인해주세요." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { message: GENERIC_MESSAGE },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
