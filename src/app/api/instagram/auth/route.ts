import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getAuthUrl } from "@/lib/instagram";

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ url: getAuthUrl() });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "인증 URL 생성 실패" }, { status: 500 });
  }
}
