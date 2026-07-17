import { NextResponse } from "next/server";

// Existing email/password members can keep signing in and resetting passwords,
// but new accounts are intentionally created only through Kakao or Google.
export async function POST() {
  return NextResponse.json(
    { error: "새 회원가입은 카카오 또는 Google 계정으로만 가능합니다." },
    { status: 403 },
  );
}
