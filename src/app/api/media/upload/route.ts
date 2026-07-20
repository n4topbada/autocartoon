import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { validateLocalUploadRequest } from "@/lib/local-upload-policy";
import { saveLocalUpload } from "@/lib/storage";

// 로컬 폴백 업로드 프록시(개발). GCS 모드에서는 클라가 스토리지로 직접 올리므로 사용 안 함.
export const maxDuration = 60;

// 가장 큰 폴더 규칙(shorts 200MB) + 멀티파트 오버헤드. 폴더별 세부 한도는 파싱 후 정책이 검사한다.
const MAX_LOCAL_UPLOAD_BODY_BYTES = 200 * 1024 * 1024 + 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_LOCAL_UPLOAD_BODY_BYTES) {
      return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      // 본문 절단·경계 오류 등 멀티파트 파싱 실패는 서버 오류가 아니라 요청 문제다.
      return NextResponse.json({ error: "업로드 본문을 해석하지 못했습니다." }, { status: 400 });
    }
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
