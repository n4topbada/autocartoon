import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { importBriefFromUrl } from "@/lib/brief-url-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => null) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || url.length > 2_048) {
      return NextResponse.json({ error: "2,048자 이하의 자료 URL을 입력해주세요." }, { status: 400 });
    }
    return NextResponse.json(await importBriefFromUrl(url));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "URL 자료를 읽지 못했습니다.";
    const status = /입력|주소|포트|공개 인터넷|리다이렉트|15MB|지원하지|찾지 못|HTTP 4/.test(message) ? 400 : 502;
    if (status === 502) console.error("Brief URL import error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
