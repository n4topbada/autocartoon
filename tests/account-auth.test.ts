import assert from "node:assert/strict";
import test from "node:test";
import { canManageAccountWithoutPassword } from "../src/lib/account-auth";

test("OAuth로 본인 확인한 세션은 알 수 없는 임의 비밀번호를 요구하지 않는다", () => {
  assert.equal(canManageAccountWithoutPassword("google", false), true);
  assert.equal(canManageAccountWithoutPassword("kakao", false), true);
  assert.equal(canManageAccountWithoutPassword("password", false), false);
  assert.equal(canManageAccountWithoutPassword(undefined, false), false);
});

test("비밀번호 없는 카카오 자리표시 계정은 기존 세션에서도 관리할 수 있다", () => {
  assert.equal(canManageAccountWithoutPassword(undefined, true), true);
});
