import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdminResetPassword,
  normalizeAdminPasswordExpiry,
  validateAdminTemporaryPassword,
} from "../src/lib/admin-password-reset";

test("관리자 임시 비밀번호는 12자 영문과 숫자를 모두 요구한다", () => {
  assert.equal(validateAdminTemporaryPassword("WONY2026ABCD"), null);
  assert.match(validateAdminTemporaryPassword("ONLYLETTERSX") || "", /숫자/);
  assert.match(validateAdminTemporaryPassword("123456789012") || "", /영문/);
  assert.match(validateAdminTemporaryPassword("WONY-2026-AB") || "", /영문과 숫자/);
  assert.match(validateAdminTemporaryPassword("SHORT123") || "", /12자/);
});

test("관리자 임시 비밀번호 유효시간은 승인된 값만 허용한다", () => {
  assert.equal(normalizeAdminPasswordExpiry(30), 30);
  assert.equal(normalizeAdminPasswordExpiry("120"), 120);
  assert.equal(normalizeAdminPasswordExpiry(1440), 1440);
  assert.equal(normalizeAdminPasswordExpiry(60), null);
});

test("관리자 임시 비밀번호는 레거시 이메일 계정에만 허용한다", () => {
  assert.equal(
    canAdminResetPassword({
      email: "wony@wonyframe.com",
      kakaoId: null,
      googleId: null,
    }),
    true,
  );
  assert.equal(
    canAdminResetPassword({
      email: "wony@wonyframe.com",
      kakaoId: "kakao-1",
      googleId: null,
    }),
    false,
  );
  assert.equal(
    canAdminResetPassword({
      email: "kakao-123@oauth.wonyframe.local",
      kakaoId: null,
      googleId: null,
    }),
    false,
  );
  assert.equal(
    canAdminResetPassword({
      email: "deleted-user@deleted.invalid",
      kakaoId: null,
      googleId: null,
    }),
    false,
  );
});
