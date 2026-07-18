import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicPageRoute,
  isPublicRoute,
  isStaticPath,
} from "../src/lib/request-routing";

test("로그인과 법적 고지 페이지는 비로그인 사용자에게 공개된다", () => {
  for (const pathname of ["/login", "/verify", "/terms", "/privacy", "/refund"]) {
    assert.equal(isPublicRoute(pathname), true, pathname);
    assert.equal(isPublicPageRoute(pathname), true, pathname);
  }
  assert.equal(isPublicPageRoute("/api/auth/me"), false);
});

test("공개 API 접두사는 경로 경계에서만 일치한다", () => {
  assert.equal(isPublicRoute("/api/auth/google"), true);
  assert.equal(isPublicRoute("/api/media/example"), true);
  assert.equal(isPublicRoute("/api/tasks/generate"), true);
  assert.equal(isPublicRoute("/api/authentic"), false);
  assert.equal(isPublicRoute("/api/mediation"), false);
  assert.equal(isPublicRoute("/settings"), false);
});

test("정적 자산 경로도 경계 밖의 유사 경로를 허용하지 않는다", () => {
  assert.equal(isStaticPath("/_next/static/app.js"), true);
  assert.equal(isStaticPath("/presets/wony/wony-01.png"), true);
  assert.equal(isStaticPath("/uploads/u/user-1/example.png"), true);
  assert.equal(isStaticPath("/_nextish/private"), false);
  assert.equal(isStaticPath("/api/private.js"), false);
  assert.equal(isStaticPath("/preset/private"), false);
});
