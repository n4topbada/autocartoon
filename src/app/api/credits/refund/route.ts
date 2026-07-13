import { NextResponse } from "next/server";

// Refunds are owned by the server operation that made the deduction.
export async function POST() {
  return NextResponse.json(
    { error: "환불은 실패한 요청에 대해 서버에서 자동 처리됩니다." },
    { status: 410 }
  );
}
