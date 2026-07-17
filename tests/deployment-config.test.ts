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
