import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST } from "../src/app/api/auth/register/route";

test("new password-based registrations are disabled", async () => {
  const response = await POST();
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.match(body.error || "", /카카오 또는 Google/);
});

test("로그인 화면은 소셜 로그인을 우선하고 이메일은 기존 회원에게만 연다", async () => {
  const source = await readFile("src/app/login/page.tsx", "utf8");
  const socialIndex = source.indexOf("styles.socialActions");
  const legacyIndex = source.indexOf("기존 이메일 계정 로그인");

  assert.ok(socialIndex >= 0 && legacyIndex > socialIndex);
  assert.match(source, /showLegacyLogin/);
  assert.match(source, /카카오·Google 도입 전에 만든 이메일 계정만/);
  assert.doesNotMatch(source, /showSignup|신규 가입/);
});

test("임시 비밀번호는 OAuth 미연결 레거시 계정에만 저장한다", async () => {
  const [resetSource, loginSource, changeSource] = await Promise.all([
    readFile("src/lib/password-reset.ts", "utf8"),
    readFile("src/app/api/auth/login/route.ts", "utf8"),
    readFile("src/app/api/auth/change-password/route.ts", "utf8"),
  ]);

  assert.match(resetSource, /kakaoId: null/);
  assert.match(resetSource, /googleId: null/);
  assert.match(loginSource, /isLegacyPasswordAccount\(user\)/);
  assert.match(changeSource, /소셜 로그인 계정은 별도 비밀번호를 사용하지 않습니다/);
});

test("계정 설정은 레거시 회원만 비밀번호 변경을 노출하고 두 OAuth 연결을 제공한다", async () => {
  const [settingsSource, meSource] = await Promise.all([
    readFile("src/components/AccountSettings.tsx", "utf8"),
    readFile("src/app/api/auth/me/route.ts", "utf8"),
  ]);

  assert.match(settingsSource, /passwordLoginAvailable && \(/);
  assert.match(settingsSource, /\/api\/auth\/kakao\?intent=link/);
  assert.match(settingsSource, /\/api\/auth\/google\?intent=link/);
  assert.match(meSource, /passwordLoginAvailable: !oauthAccount/);
});
