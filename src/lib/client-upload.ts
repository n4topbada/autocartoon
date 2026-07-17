/**
 * 클라이언트 직접 업로드 헬퍼 (GCP 단일).
 * 서버에서 업로드 티켓을 발급받아(인증·소유권·경로·크기 서명) 스토리지로 직접 올린다.
 * - gcs: GCS V4 서명 POST policy로 multipart 업로드.
 * - local: 서버 프록시 엔드포인트로 파일 POST(개발 폴백).
 * 반환값은 DB에 저장될 참조(ref).
 */

interface UploadTicket {
  provider: "gcs" | "local";
  url: string;
  fields: Record<string, string>;
  ref: string;
}

export async function uploadViaTicket(params: {
  signEndpoint: string;
  file: Blob;
  filename: string;
  contentType: string;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const signRes = await fetch(params.signEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: params.filename,
      contentType: params.contentType,
      size: params.file.size,
      ...params.meta,
    }),
  });
  const ticket = (await signRes.json().catch(() => ({}))) as UploadTicket & { error?: string };
  if (!signRes.ok) throw new Error(ticket.error || "업로드 준비에 실패했습니다.");

  const form = new FormData();
  if (ticket.provider === "gcs") {
    // 서명 POST policy: 필드 순서 상관없으나 file은 마지막에 붙인다.
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append("file", params.file);
    const up = await fetch(ticket.url, { method: "POST", body: form });
    if (!up.ok) throw new Error("스토리지 업로드에 실패했습니다.");
  } else {
    form.append("objectPath", ticket.fields.objectPath);
    form.append("file", params.file, params.filename);
    const up = await fetch(ticket.url, { method: "POST", body: form });
    if (!up.ok) throw new Error("업로드에 실패했습니다.");
  }
  return ticket.ref;
}
