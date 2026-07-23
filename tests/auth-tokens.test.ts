import assert from "node:assert/strict";
import test from "node:test";
import { createAuthToken, hashAuthToken, isAuthTokenShape } from "../src/lib/auth-tokens";

test("인증 토큰은 URL-safe 난수이며 요청마다 달라진다", () => {
  const first = createAuthToken();
  const second = createAuthToken();

  assert.equal(isAuthTokenShape(first), true);
  assert.equal(isAuthTokenShape(second), true);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /[+/=]/);
});

test("인증 토큰 해시는 결정적이며 원문을 노출하지 않는다", () => {
  const token = createAuthToken();
  const hash = hashAuthToken(token);

  assert.equal(hash, hashAuthToken(token));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
});

test("짧거나 허용되지 않은 문자가 든 토큰은 거부한다", () => {
  assert.equal(isAuthTokenShape("short"), false);
  assert.equal(isAuthTokenShape(`${"a".repeat(40)}+`), false);
  assert.equal(isAuthTokenShape(null), false);
});
