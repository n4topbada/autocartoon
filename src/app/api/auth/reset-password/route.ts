import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-policy";
import { resetPasswordWithToken } from "@/lib/password-reset";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const token = body.token;
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const status = await resetPasswordWithToken(token, newPassword);
    if (status === "expired") {
      return NextResponse.json(
        { error: "재설정 링크가 만료되었습니다. 로그인 화면에서 다시 요청해주세요." },
        { status: 400 }
      );
    }
    if (status !== "reset") {
      return NextResponse.json(
        { error: "유효하지 않거나 이미 사용된 재설정 링크입니다." },
        { status: 400 }
      );
    }
    return NextResponse.json({ message: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요." });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "비밀번호를 재설정하지 못했습니다." }, { status: 500 });
  }
}
