import sharp from "sharp";
import {
  deleteObject,
  putObject,
  readObjectAsBase64,
  type OwnerScope,
} from "./storage";

/**
 * 고수준 업로드 API. 저수준 프로바이더(GCS | 로컬 파일시스템)는 storage.ts가 담당한다.
 * `owner`(userId 또는 "public")는 GCS 모드에서 객체 경로/접근제어에 쓰이고,
 * 로컬 모드에선 public/uploads 경로 스코프에만 반영된다.
 * 반환 URL/참조는 gcs=/api/media/{key}, 로컬=/uploads/....
 */

async function createThumbnailBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}

export async function uploadBase64ToBlob(
  base64: string,
  mimeType: string,
  folder = "images",
  owner?: OwnerScope
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const { ref } = await putObject(buffer, mimeType, folder, { owner, extFallback: ".png" });
  return ref;
}

export async function uploadBufferToBlob(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  owner?: OwnerScope
): Promise<string> {
  const { ref } = await putObject(buffer, mimeType, folder, { owner, extFallback: ".webp" });
  return ref;
}

export async function uploadBase64ImageWithThumbnail(
  base64: string,
  mimeType: string,
  folder = "images",
  owner?: OwnerScope
): Promise<{ blobUrl: string; thumbnailUrl: string }> {
  const buffer = Buffer.from(base64, "base64");
  const thumbnailBuffer = await createThumbnailBuffer(buffer);
  const blobUrl = await uploadBase64ToBlob(base64, mimeType, folder, owner);
  try {
    const thumbnailUrl = await uploadBufferToBlob(thumbnailBuffer, "image/webp", `${folder}/thumbs`, owner);
    return { blobUrl, thumbnailUrl };
  } catch (error) {
    await deleteBlob(blobUrl);
    throw error;
  }
}

export async function uploadThumbnailForBlobUrl(
  blobUrl: string,
  folder = "images",
  owner?: OwnerScope
): Promise<string> {
  const image = await readObjectAsBase64(blobUrl);
  const thumbnailBuffer = await createThumbnailBuffer(Buffer.from(image.base64, "base64"));
  return uploadBufferToBlob(thumbnailBuffer, "image/webp", `${folder}/thumbs`, owner);
}

export async function fetchBlobAsBase64(
  blobUrl: string
): Promise<{ base64: string; mimeType: string }> {
  return readObjectAsBase64(blobUrl);
}

export async function deleteBlob(blobUrl: string): Promise<void> {
  await deleteObject(blobUrl);
}
