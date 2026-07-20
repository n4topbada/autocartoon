/**
 * 프로바이더 독립 객체 저장소 (GCP 단일).
 *
 * - `GCS_BUCKET` 설정 시: 비공개 GCS 버킷 + 미디어 게이트웨이(/api/media).
 * - 미설정(로컬 개발): public/uploads 파일시스템 폴백.
 *
 * GCS 모드에서 저장 참조(DB blobUrl 값)는 게이트웨이 URL `/api/media/{base64url(objectPath)}`.
 * 응답이 blobUrl을 그대로 내보내도 브라우저는 게이트웨이에서 소유권·공개여부 검사를
 * 받고 서명 URL로 302된다. 서버측 읽기/삭제는 참조에서 객체를 복원해 직접 처리한다.
 *
 * 객체 경로(gcs): 소유물 u/{userId}/{folder}/{file}, 공용 public/{folder}/{file}.
 */

import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { getAppOrigin } from "./app-url";

type StorageProvider = "gcs" | "local";

function getStorageProvider(): StorageProvider {
  return process.env.GCS_BUCKET ? "gcs" : "local";
}

function gcsBucketName(): string {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("GCS_BUCKET 환경변수가 필요합니다.");
  return bucket;
}

const GS_PREFIX_RE = /^gs:\/\/([^/]+)\/(.+)$/;
const MEDIA_PREFIX = "/api/media/";

export function isSafeStorageObjectPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\0") &&
    !value.includes("\\") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !path.isAbsolute(value) &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function resolveWithin(root: string, relativePath: string): string {
  if (!isSafeStorageObjectPath(relativePath)) throw new Error("잘못된 저장 경로");

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("저장 경로가 허용 범위를 벗어났습니다.");
  }
  return resolvedPath;
}

function localPublicPath(relativePath: string): string {
  return resolveWithin(path.join(process.cwd(), "public"), relativePath);
}

function localUploadPath(objectPath: string): string {
  return resolveWithin(path.join(process.cwd(), "public", "uploads"), objectPath);
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
export function decodeMediaKey(key: string): string {
  return Buffer.from(key, "base64url").toString("utf8");
}

/** 게이트웨이 URL(gcs) 또는 gs:// 참조에서 실제 GCS 객체를 복원한다. 아니면 null. */
function resolveGcsObject(ref: string): { bucket: string; objectPath: string } | null {
  const gs = GS_PREFIX_RE.exec(ref);
  if (gs && isSafeStorageObjectPath(gs[2])) return { bucket: gs[1], objectPath: gs[2] };
  if (ref.startsWith(MEDIA_PREFIX)) {
    const key = ref.slice(MEDIA_PREFIX.length).split(/[/?#]/)[0];
    try {
      const objectPath = decodeMediaKey(key);
      if (!isSafeStorageObjectPath(objectPath)) return null;
      return { bucket: gcsBucketName(), objectPath };
    } catch {
      return null;
    }
  }
  return null;
}

// --- GCS 클라이언트 (지연 로드) ---

let gcsStoragePromise: Promise<import("@google-cloud/storage").Storage> | null = null;
async function getGcs() {
  if (!gcsStoragePromise) {
    gcsStoragePromise = (async () => {
      const { Storage } = await import("@google-cloud/storage");
      // Cloud Run/로컬 모두 ADC 사용(키 파일 불필요).
      return new Storage();
    })();
  }
  return gcsStoragePromise;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
};
function extFor(mimeType: string, fallback = ".png"): string {
  return MIME_TO_EXT[mimeType] || fallback;
}
const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime])
);
function mimeForExt(objectPath: string): string | undefined {
  const ext = path.extname(objectPath).toLowerCase();
  return EXT_TO_MIME[ext] || (ext === ".jpeg" ? "image/jpeg" : undefined);
}

/** 소유자 스코프. userId 문자열이면 개인 소유, "public"이면 공용. */
export type OwnerScope = string | "public" | undefined;

function scopedObjectPath(owner: OwnerScope, folder: string, filename: string): string {
  const base = owner === "public" ? "public" : owner ? `u/${owner}` : "shared";
  return `${base}/${folder}/${filename}`;
}

function mediaUrlForPath(objectPath: string): string {
  return `${MEDIA_PREFIX}${base64urlEncode(objectPath)}`;
}

/** objectPath → DB에 저장되는 게이트웨이 참조(/api/media/{key}). 공개여부 조회 시 매칭용. */
export function mediaRefForObjectPath(objectPath: string): string {
  return mediaUrlForPath(objectPath);
}

export interface PutResult {
  ref: string;
  objectPath: string;
}
export interface PutOptions {
  owner?: OwnerScope;
  extFallback?: string;
}

/** 버퍼를 저장하고 참조를 반환한다. */
export async function putObject(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  options: PutOptions = {}
): Promise<PutResult> {
  const ext = extFor(mimeType, options.extFallback ?? ".webp");
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const objectPath = scopedObjectPath(options.owner, folder, filename);

  if (getStorageProvider() === "gcs") {
    const bucket = gcsBucketName();
    const gcs = await getGcs();
    await gcs.bucket(bucket).file(objectPath).save(buffer, {
      contentType: mimeType,
      resumable: false,
    });
    return { ref: mediaUrlForPath(objectPath), objectPath };
  }

  // 로컬 파일시스템 폴백(개발).
  const uploadPath = localUploadPath(objectPath);
  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, buffer);
  return { ref: `/uploads/${objectPath.replace(/\\/g, "/")}`, objectPath };
}

/** 참조로 객체를 삭제한다(없으면 조용히 무시). */
export async function deleteObject(ref: string): Promise<void> {
  if (!ref) return;
  const gcsObj = resolveGcsObject(ref);
  if (gcsObj) {
    try {
      const gcs = await getGcs();
      await gcs.bucket(gcsObj.bucket).file(gcsObj.objectPath).delete({ ignoreNotFound: true });
    } catch (error) {
      console.error("GCS delete error:", error);
    }
    return;
  }
  try {
    const objectPath = objectPathFromRef(ref);
    if (objectPath) await unlink(localUploadPath(objectPath));
  } catch (error) {
    console.error("Local blob delete error:", error);
  }
}

function resolveLocalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getAppOrigin();
  const encoded = url.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `${base.replace(/\/+$/, "")}${encoded}`;
}

/** 참조에서 바이트를 읽어 base64로 반환(AI 입력·썸네일용). GCS는 서명 없이 직접 읽는다. */
export async function readObjectAsBase64(
  ref: string
): Promise<{ base64: string; mimeType: string }> {
  const gcsObj = resolveGcsObject(ref);
  if (gcsObj) {
    const gcs = await getGcs();
    const file = gcs.bucket(gcsObj.bucket).file(gcsObj.objectPath);
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return {
      base64: buffer.toString("base64"),
      mimeType: (metadata.contentType as string) || "image/png",
    };
  }

  // 로컬 정적 파일 (예: /presets/wony/wony-01.png, /uploads/...)
  if (ref.startsWith("/") && !ref.startsWith("//") && !ref.startsWith(MEDIA_PREFIX)) {
    const filePath = localPublicPath(ref.slice(1));
    const buffer = await readFile(filePath);
    const ext = path.extname(ref).toLowerCase();
    const mimeType =
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" : "image/png";
    return { base64: buffer.toString("base64"), mimeType };
  }

  const res = await fetch(resolveLocalUrl(ref));
  if (!res.ok) throw new Error(`Failed to fetch blob: ${ref}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    mimeType: res.headers.get("content-type") || "image/png",
  };
}

/** 읽기용 V4 서명 URL(짧은 만료). 미디어 게이트웨이가 302 대상으로 사용. */
export async function signReadUrl(ref: string, ttlSeconds = 300): Promise<string> {
  const gcsObj = resolveGcsObject(ref);
  if (!gcsObj) return resolveLocalUrl(ref);
  const gcs = await getGcs();
  const [url] = await gcs
    .bucket(gcsObj.bucket)
    .file(gcsObj.objectPath)
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + ttlSeconds * 1000 });
  return url;
}

export interface UploadTicket {
  provider: StorageProvider;
  url: string;
  fields: Record<string, string>;
  ref: string;
  objectPath: string;
}

/**
 * 클라이언트 직접 업로드용 티켓. 인증·소유권 확인 뒤 특정 경로/타입/최대크기로만
 * 서명한다. GCS는 크기 제한을 강제하는 V4 POST policy를 사용한다.
 * 로컬 모드에서는 서버 업로드 엔드포인트(/api/media/upload)로 프록시한다.
 */
export async function createUploadTicket(params: {
  owner: OwnerScope;
  folder: string;
  mimeType: string;
  maxBytes: number;
  ttlSeconds?: number;
}): Promise<UploadTicket> {
  const { owner, folder, mimeType, maxBytes, ttlSeconds = 600 } = params;
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extFor(mimeType, ".bin")}`;
  const objectPath = scopedObjectPath(owner, folder, filename);

  if (getStorageProvider() === "gcs") {
    const bucket = gcsBucketName();
    const gcs = await getGcs();
    const [response] = await gcs
      .bucket(bucket)
      .file(objectPath)
      .generateSignedPostPolicyV4({
        expires: Date.now() + ttlSeconds * 1000,
        fields: { "Content-Type": mimeType },
        conditions: [["content-length-range", 0, maxBytes]],
      });
    return {
      provider: "gcs",
      url: response.url,
      fields: response.fields,
      ref: mediaUrlForPath(objectPath),
      objectPath,
    };
  }

  // 로컬: 서버 업로드 엔드포인트로 프록시(브라우저가 파일을 서버로 POST → 서버가 fs 저장).
  return {
    provider: "local",
    url: "/api/media/upload",
    fields: { objectPath },
    ref: `/uploads/${objectPath.replace(/\\/g, "/")}`,
    objectPath,
  };
}

/** 로컬 폴백 업로드: 서버가 직접 fs에 저장. objectPath는 소유자 스코프가 포함돼 있어야 한다. */
export async function saveLocalUpload(objectPath: string, buffer: Buffer): Promise<string> {
  const uploadPath = localUploadPath(objectPath);
  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, buffer);
  return `/uploads/${objectPath.replace(/\\/g, "/")}`;
}

/** 참조에서 저장 객체 경로(소유자 스코프 포함)를 복원한다. gcs 게이트웨이/로컬 uploads 모두 지원. */
export function objectPathFromRef(ref: string): string | null {
  const gcsObj = resolveGcsObject(ref);
  if (gcsObj) return gcsObj.objectPath;
  if (ref.startsWith("/uploads/")) {
    const p = ref.slice("/uploads/".length);
    return isSafeStorageObjectPath(p) ? p : null;
  }
  return null;
}

/** 참조가 특정 사용자 소유 경로(u/{userId}/…)인지 검증한다. 확인 라우트의 IDOR 방지. */
export function refOwnedBy(ref: string, userId: string): boolean {
  const objectPath = objectPathFromRef(ref);
  return Boolean(objectPath && objectPath.startsWith(`u/${userId}/`));
}

/** 참조된 객체의 존재·크기·콘텐츠타입을 조회한다(확인 단계에서 위조 방지 + 용량 계측). */
export async function statObject(
  ref: string
): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
  const gcsObj = resolveGcsObject(ref);
  if (gcsObj) {
    const gcs = await getGcs();
    const file = gcs.bucket(gcsObj.bucket).file(gcsObj.objectPath);
    const [exists] = await file.exists();
    if (!exists) return { exists: false };
    const [metadata] = await file.getMetadata();
    return {
      exists: true,
      sizeBytes: metadata.size ? Number(metadata.size) : undefined,
      contentType: (metadata.contentType as string | undefined) || undefined,
    };
  }
  const objectPath = objectPathFromRef(ref);
  if (objectPath) {
    try {
      const info = await stat(localUploadPath(objectPath));
      // 로컬 파일명 확장자는 업로드 티켓의 mimeType에서 만들어지므로 역매핑이 원본과 일치한다.
      return { exists: true, sizeBytes: info.size, contentType: mimeForExt(objectPath) };
    } catch {
      return { exists: false };
    }
  }
  return { exists: false };
}
