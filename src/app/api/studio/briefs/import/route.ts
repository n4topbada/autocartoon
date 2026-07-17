import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { importBriefDocument } from "@/lib/brief-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "가져올 파일을 선택해주세요." }, { status: 400 });
    }

    const result = await importBriefDocument({
      fileName: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "기획 자료를 읽지 못했습니다.";
    const status = /지원하지|선택|필요|이하여야|찾지 못/.test(message) ? 400 : 500;
    if (status === 500) console.error("Brief import error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
