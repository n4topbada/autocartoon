import assert from "node:assert/strict";
import test from "node:test";
import { MIN_PASSWORD_LENGTH, validatePassword } from "../src/lib/password-policy";

test("비밀번호는 8자 이상이어야 한다", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(validatePassword("Short!") || "", /8자 이상/);
});

test("비밀번호는 특수문자를 하나 이상 포함해야 한다", () => {
  assert.match(validatePassword("Password123") || "", /특수문자/);
  assert.equal(validatePassword("Password!"), null);
  assert.equal(validatePassword("한글안전비밀번호!"), null);
});

test("bcrypt 한계인 72바이트를 넘는 비밀번호는 거부한다", () => {
  assert.match(validatePassword(`${"a".repeat(72)}!`) || "", /너무 깁니다/);
});
