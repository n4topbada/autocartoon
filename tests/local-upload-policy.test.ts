import assert from "node:assert/strict";
import test from "node:test";
import { validateLocalUploadRequest } from "../src/lib/local-upload-policy";

const userId = "user-1";

test("로컬 업로드는 서버가 발급하는 사용자별 경로와 형식만 허용한다", () => {
  assert.deepEqual(
    validateLocalUploadRequest({
      objectPath: `u/${userId}/edited/1720000000000-abc123.png`,
      userId,
      mimeType: "image/png",
      sizeBytes: 1024,
    }),
    { ok: true }
  );

  assert.equal(
    validateLocalUploadRequest({
      objectPath: "public/edited/1720000000000-abc123.png",
      userId,
      mimeType: "image/png",
      sizeBytes: 1024,
    }).ok,
    false
  );
  assert.equal(
    validateLocalUploadRequest({
      objectPath: `u/other-user/edited/1720000000000-abc123.png`,
      userId,
      mimeType: "image/png",
      sizeBytes: 1024,
    }).ok,
    false
  );
});

test("로컬 업로드는 MIME 위장과 폴더별 용량 초과를 거부한다", () => {
  const disguised = validateLocalUploadRequest({
    objectPath: `u/${userId}/edited/1720000000000-abc123.html`,
    userId,
    mimeType: "text/html",
    sizeBytes: 1024,
  });
  assert.deepEqual(disguised, {
    ok: false,
    status: 400,
    error: "지원하지 않는 업로드 형식입니다.",
  });

  const oversized = validateLocalUploadRequest({
    objectPath: `u/${userId}/edited/1720000000000-abc123.png`,
    userId,
    mimeType: "image/png",
    sizeBytes: 20 * 1024 * 1024 + 1,
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.status, 413);
});
