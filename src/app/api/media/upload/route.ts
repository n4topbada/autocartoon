import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { saveLocalUpload } from "@/lib/storage";

// 로컬 폴백 업로드 프록시(개발). GCS 모드에서는 클라가 스토리지로 직접 올리므로 사용 안 함.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const form = await req.formData();
    const objectPath = String(form.get("objectPath") || "");
    const file = form.get("file");
    if (!objectPath || !(file instanceof Blob)) {
      return NextResponse.json({ error: "objectPath와 file이 필요합니다." }, { status: 400 });
    }
    // 소유자 스코프 검증: 자신의 경로 또는 공용만 허용.
    if (
      objectPath.includes("..") ||
      !(objectPath.startsWith(`u/${session.userId}/`) || objectPath.startsWith("public/"))
    ) {
      return NextResponse.json({ error: "허용되지 않은 업로드 경로입니다." }, { status: 403 });
    }
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ref = await saveLocalUpload(objectPath, buffer);
    return NextResponse.json({ ok: true, ref });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Local upload proxy error:", error);
    return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 });
  }
}
