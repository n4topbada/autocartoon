import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the legacy Vercel deployment redirects every path to Cloud Run", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
    redirects?: Array<{
      source?: string;
      destination?: string;
      permanent?: boolean;
    }>;
  };

  assert.deepEqual(config.redirects, [
    {
      source: "/:path*",
      destination:
        "https://wonybananabot-272254743773.asia-northeast3.run.app/:path*",
      permanent: true,
    },
  ]);
});

test("Next.js sends baseline browser security headers on every route", async () => {
  const nextConfig = (await import("../next.config")).default;
  assert.equal(typeof nextConfig.headers, "function");

  const rules = await nextConfig.headers!();
  assert.equal(rules[0]?.source, "/:path*");
  assert.deepEqual(
    Object.fromEntries(rules[0]?.headers.map((header) => [header.key, header.value]) ?? []),
    {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }
  );
});
