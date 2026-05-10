import { put, del } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * base64 이미지를 Vercel Blob에 업로드하고 URL을 반환
 */
export async function uploadBase64ToBlob(
  base64: string,
  mimeType: string,
  folder: string = "images"
): Promise<string> {
  const ext = MIME_TO_EXT[mimeType] || ".png";
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const buffer = Buffer.from(base64, "base64");

  try {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
    });

    return blob.url;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn("Vercel Blob upload failed. Falling back to local public/uploads.", error);
    const uploadPath = path.join(process.cwd(), "public", "uploads", filename);
    await mkdir(path.dirname(uploadPath), { recursive: true });
    await writeFile(uploadPath, buffer);
    return `/uploads/${filename.replace(/\\/g, "/")}`;
  }
}

/**
 * Vercel Blob URL에서 이미지를 fetch하여 base64로 변환
 * (Gemini API 호출 시 사용)
 */
/**
 * URL을 절대 URL로 변환 (상대 경로 → 전체 URL)
 */
function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // 상대 경로 (예: /presets/wony/...)인 경우 호스트 추가 + 한글/공백 인코딩
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const encoded = url
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}${encoded}`;
}

export async function fetchBlobAsBase64(
  blobUrl: string
): Promise<{ base64: string; mimeType: string }> {
  // 로컬 정적 파일 (예: /presets/wony/wony-01.png) → 파일시스템에서 직접 읽기
  if (blobUrl.startsWith("/") && !blobUrl.startsWith("//")) {
    const filePath = path.join(process.cwd(), "public", blobUrl);
    const buffer = await readFile(filePath);
    const ext = path.extname(blobUrl).toLowerCase();
    const mimeType =
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" : "image/png";
    return { base64: buffer.toString("base64"), mimeType };
  }

  // 외부 URL (Vercel Blob 등) → HTTP fetch
  const fullUrl = resolveUrl(blobUrl);
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`Failed to fetch blob: ${fullUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/png";
  return {
    base64: buffer.toString("base64"),
    mimeType,
  };
}

/**
 * Vercel Blob 삭제
 */
export async function deleteBlob(blobUrl: string): Promise<void> {
  try {
    if (blobUrl.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", blobUrl);
      await unlink(filePath);
      return;
    }

    await del(blobUrl);
  } catch (err) {
    console.error("Blob delete error:", err);
  }
}
