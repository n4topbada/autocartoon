import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("이메일 회원가입은 비밀번호 정책과 메일 인증을 거친다", async () => {
  const source = await readFile("src/app/api/auth/register/route.ts", "utf8");

  assert.match(source, /validatePassword\(password\)/);
  assert.match(source, /sendVerificationEmail/);
  assert.match(source, /emailVerified: false/);
  assert.match(source, /hashAuthToken\(token\)/);
  assert.match(source, /인증 메일을 보냈습니다/);
});

test("로그인 화면은 소셜 로그인과 이메일 로그인·가입·복구를 모두 제공한다", async () => {
  const source = await readFile("src/app/login/page.tsx", "utf8");
  const socialIndex = source.indexOf("styles.socialActions");
  const emailIndex = source.indexOf("또는 이메일로");

  assert.ok(socialIndex >= 0 && emailIndex > socialIndex);
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /비밀번호를 잊으셨나요\?/);
  assert.match(source, /8자 이상, 특수문자 1개 이상/);
});

test("비밀번호 재설정 토큰은 해시 저장·만료·일회용·세션 폐기를 적용한다", async () => {
  const [resetSource, pageSource] = await Promise.all([
    readFile("src/lib/password-reset.ts", "utf8"),
    readFile("src/app/reset-password/page.tsx", "utf8"),
  ]);

  assert.match(resetSource, /hashAuthToken\(token\)/);
  assert.match(resetSource, /passwordResetTokenExpiresAt: \{ gt: now \}/);
  assert.match(resetSource, /passwordResetTokenHash: null/);
  assert.match(resetSource, /userSession\.deleteMany/);
  assert.match(resetSource, /kakaoId: null/);
  assert.match(resetSource, /googleId: null/);
  assert.match(pageSource, /window\.location\.hash/);
  assert.match(pageSource, /addEventListener\("hashchange"/);
  assert.match(pageSource, /\/api\/auth\/reset-password/);
});

test("계정 설정은 직접 비밀번호 변경 없이 두 OAuth 연결을 제공한다", async () => {
  const [settingsSource, meSource] = await Promise.all([
    readFile("src/components/AccountSettings.tsx", "utf8"),
    readFile("src/app/api/auth/me/route.ts", "utf8"),
  ]);

  assert.doesNotMatch(settingsSource, /\/api\/auth\/change-password/);
  assert.doesNotMatch(settingsSource, /password-change-title/);
  assert.match(settingsSource, /\/api\/auth\/kakao\?intent=link/);
  assert.match(settingsSource, /\/api\/auth\/google\?intent=link/);
  assert.match(meSource, /passwordLoginAvailable: !oauthAccount/);
});

test("이메일 인증 완료 시 웰컴 크레딧과 감사 로그를 함께 기록한다", async () => {
  const source = await readFile("src/app/api/auth/verify/route.ts", "utf8");

  assert.match(source, /WELCOME_CREDITS/);
  assert.match(source, /createCreditLedgerWithAudit/);
  assert.match(source, /authProvider: "email"/);
  assert.match(source, /welcomeCreditsGrantedAt/);
});
