import assert from "node:assert/strict";
import test from "node:test";
import { getAppOrigin, getAppUrl } from "../src/lib/app-url";
import { getKakaoRedirectUri } from "../src/lib/kakao-auth";

const GCP_ORIGIN =
  "https://wonybananabot-272254743773.asia-northeast3.run.app";

function restoreEnv(
  name: "APP_ORIGIN" | "NEXT_PUBLIC_APP_URL" | "CLOUD_RUN_BASE_URL",
  value?: string
) {
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

test("malformed APP_ORIGIN falls back without breaking OAuth URLs", () => {
  const previousAppOrigin = process.env.APP_ORIGIN;
  const previousPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousCloudRunUrl = process.env.CLOUD_RUN_BASE_URL;
  const previousConsoleError = console.error;
  const logged: string[] = [];
  process.env.APP_ORIGIN = `${GCP_ORIGIN} PRISMA_CONNECTION_LIMIT=5`;
  process.env.NEXT_PUBLIC_APP_URL = "not-a-valid-origin";
  process.env.CLOUD_RUN_BASE_URL = GCP_ORIGIN;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));

  try {
    assert.equal(getAppOrigin("http://0.0.0.0:8080"), GCP_ORIGIN);
    assert.equal(
      getKakaoRedirectUri("http://0.0.0.0:8080"),
      `${GCP_ORIGIN}/api/auth/kakao/callback`
    );
    assert.equal(logged.length, 2);
    assert.match(logged[0], /app_origin_invalid/);
    assert.doesNotMatch(logged[0], /PRISMA_CONNECTION_LIMIT/);
  } finally {
    console.error = previousConsoleError;
    restoreEnv("APP_ORIGIN", previousAppOrigin);
    restoreEnv("NEXT_PUBLIC_APP_URL", previousPublicUrl);
    restoreEnv("CLOUD_RUN_BASE_URL", previousCloudRunUrl);
  }
});
