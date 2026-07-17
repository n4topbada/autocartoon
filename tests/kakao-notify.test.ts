import assert from "node:assert/strict";
import test from "node:test";
import { createSolapiAuthorization } from "../src/lib/kakao-notify";

test("솔라피 인증 헤더는 API Secret 기반 HMAC-SHA256 서명을 만든다", () => {
  const dateTime = "2026-07-18T00:00:00.000Z";
  const salt = "00112233445566778899aabbccddeeff";
  const header = createSolapiAuthorization("test-key", "test-secret", {
    dateTime,
    salt,
  });

  assert.equal(
    header,
    "HMAC-SHA256 apiKey=test-key, date=2026-07-18T00:00:00.000Z, " +
      "salt=00112233445566778899aabbccddeeff, " +
      "signature=3451de881b3139e89b600c1ef98c6d86139fd7f74121bbbaf9527d4756ff5e43",
  );
  assert.doesNotMatch(header, /test-secret/);
});
