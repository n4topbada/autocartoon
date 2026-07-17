import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { validateLocalUploadRequest } from "@/lib/local-upload-policy";
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
    const policy = validateLocalUploadRequest({
      objectPath,
      userId: session.userId,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error }, { status: policy.status });
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
