import assert from "node:assert/strict";
import test from "node:test";
import {
  addReturnTo,
  createLoginRedirect,
  normalizeReturnTo,
  shouldRedirectForUnauthorizedApi,
} from "../src/lib/auth-navigation";

test("로그인 복귀 주소는 같은 서비스의 내부 경로만 허용한다", () => {
  assert.equal(
    normalizeReturnTo("/studio?mode=gesture#result"),
    "/studio?mode=gesture#result",
  );
  assert.equal(normalizeReturnTo("https://example.com/studio"), "/");
  assert.equal(normalizeReturnTo("//example.com/studio"), "/");
  assert.equal(normalizeReturnTo("/\\example.com/studio"), "/");
  assert.equal(normalizeReturnTo("/login?returnTo=/studio"), "/");
  assert.equal(normalizeReturnTo("/login/expired?returnTo=/studio"), "/");
});

test("로그인과 OAuth 주소에 정규화된 복귀 경로를 보존한다", () => {
  const loginPath = createLoginRedirect(
    "/archive?type=image",
    "session_expired",
  );
  const loginUrl = new URL(loginPath, "https://wony.local");
  assert.equal(loginUrl.pathname, "/login");
  assert.equal(loginUrl.searchParams.get("returnTo"), "/archive?type=image");
  assert.equal(loginUrl.searchParams.get("reason"), "session_expired");

  const oauthPath = addReturnTo("/api/auth/kakao?intent=login", "/studio");
  const oauthUrl = new URL(oauthPath, "https://wony.local");
  assert.equal(oauthUrl.searchParams.get("intent"), "login");
  assert.equal(oauthUrl.searchParams.get("returnTo"), "/studio");
});

test("보호 화면의 내부 API 세션 만료만 로그인 전환 대상으로 삼는다", () => {
  const page = "https://wony.local/studio?project=one";
  assert.equal(
    shouldRedirectForUnauthorizedApi(401, "/api/studio/projects", page),
    true,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(401, "/api/auth/change-password", page),
    true,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(401, "/api/auth/login", page),
    false,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(401, "/api/tasks/image", page),
    false,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(
      401,
      "https://provider.example/api/generate",
      page,
    ),
    false,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(
      401,
      "/api/studio/projects",
      "https://wony.local/login",
    ),
    false,
  );
  assert.equal(
    shouldRedirectForUnauthorizedApi(403, "/api/studio/projects", page),
    false,
  );
});
