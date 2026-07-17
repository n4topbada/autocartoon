import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeStorageObjectPath,
  objectPathFromRef,
  readObjectAsBase64,
} from "../src/lib/storage";

test("로컬 업로드 참조는 정규화된 안전 경로만 허용한다", () => {
  assert.equal(
    objectPathFromRef("/uploads/u/user-1/images/example.webp"),
    "u/user-1/images/example.webp"
  );
  assert.equal(objectPathFromRef("/uploads/u/user-1/../secret.webp"), null);
  assert.equal(objectPathFromRef("/uploads/u\\user-1\\secret.webp"), null);
  assert.equal(objectPathFromRef("/uploads/u/user-1/image.webp?download=1"), null);
});

test("미디어 객체 경로는 URL·Windows 구분자와 점 경로를 거부한다", () => {
  assert.equal(isSafeStorageObjectPath("u/user-1/images/example.webp"), true);
  assert.equal(isSafeStorageObjectPath("u/user-1/../secret.webp"), false);
  assert.equal(isSafeStorageObjectPath("u\\user-1\\secret.webp"), false);
  assert.equal(isSafeStorageObjectPath("u/user-1/example.webp?download=1"), false);
});

test("로컬 정적 파일 읽기는 public 디렉터리 밖으로 나갈 수 없다", async () => {
  await assert.rejects(readObjectAsBase64("/../package.json"), /잘못된 저장 경로/);

  const image = await readObjectAsBase64("/robot-wony.png");
  assert.equal(image.mimeType, "image/png");
  assert.ok(image.base64.length > 0);
});
