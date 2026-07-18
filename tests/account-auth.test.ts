import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageAccountWithoutPassword,
  hasOAuthIdentity,
  isLegacyPasswordAccount,
} from "../src/lib/account-auth";

test("OAuth로 본인 확인한 세션은 알 수 없는 임의 비밀번호를 요구하지 않는다", () => {
  assert.equal(canManageAccountWithoutPassword("google", false), true);
  assert.equal(canManageAccountWithoutPassword("kakao", false), true);
  assert.equal(canManageAccountWithoutPassword("password", false), false);
  assert.equal(canManageAccountWithoutPassword(undefined, false), false);
});

test("OAuth가 연결된 계정은 기존 세션에서도 비밀번호 없이 관리할 수 있다", () => {
  assert.equal(canManageAccountWithoutPassword(undefined, true), true);
});

test("비밀번호 로그인은 OAuth가 연결되지 않은 레거시 계정에만 남긴다", () => {
  assert.equal(hasOAuthIdentity({ kakaoId: "kakao-1", googleId: null }), true);
  assert.equal(hasOAuthIdentity({ kakaoId: null, googleId: "google-1" }), true);
  assert.equal(isLegacyPasswordAccount({ kakaoId: null, googleId: null }), true);
  assert.equal(isLegacyPasswordAccount({ kakaoId: "kakao-1" }), false);
});
