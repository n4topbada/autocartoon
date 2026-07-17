import assert from "node:assert/strict";
import test from "node:test";
import { getAppOrigin, getAppUrl } from "../src/lib/app-url";
import { getKakaoRedirectUri } from "../src/lib/kakao-auth";

const GCP_ORIGIN =
  "https://wonybananabot-272254743773.asia-northeast3.run.app";

function restoreEnv(name: "APP_ORIGIN" | "NEXT_PUBLIC_APP_URL", value?: string) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("APP_ORIGIN overrides Cloud Run's internal request origin", () => {
  const previousAppOrigin = process.env.APP_ORIGIN;
  const previousPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.APP_ORIGIN = `${GCP_ORIGIN}/`;
  process.env.NEXT_PUBLIC_APP_URL = "https://stale.example.com";

  try {
    assert.equal(getAppOrigin("http://0.0.0.0:8080"), GCP_ORIGIN);
    assert.equal(
      getAppUrl("/login?kakao=failed", "http://0.0.0.0:8080"),
      `${GCP_ORIGIN}/login?kakao=failed`
    );
    assert.equal(
      getKakaoRedirectUri("http://0.0.0.0:8080"),
      `${GCP_ORIGIN}/api/auth/kakao/callback`
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousAppOrigin);
    restoreEnv("NEXT_PUBLIC_APP_URL", previousPublicUrl);
  }
});

test("request origin remains the local development fallback", () => {
  const previousAppOrigin = process.env.APP_ORIGIN;
  const previousPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_ORIGIN;
  delete process.env.NEXT_PUBLIC_APP_URL;

  try {
    assert.equal(
      getKakaoRedirectUri("http://localhost:3100"),
      "http://localhost:3100/api/auth/kakao/callback"
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousAppOrigin);
    restoreEnv("NEXT_PUBLIC_APP_URL", previousPublicUrl);
  }
});
