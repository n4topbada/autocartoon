import assert from "node:assert/strict";
import test from "node:test";
import { isTransientAIError, withTransientAIRetry } from "../src/lib/ai-retry";

test("transient AI errors include throttling and service availability failures", () => {
  assert.equal(isTransientAIError(new Error("429 RESOURCE_EXHAUSTED")), true);
  assert.equal(isTransientAIError({ code: 503, status: "UNAVAILABLE" }), true);
  assert.equal(isTransientAIError(new Error("400 INVALID_ARGUMENT")), false);
  assert.equal(isTransientAIError(new Error("403 PERMISSION_DENIED")), false);
});

test("AI retry waits according to the configured backoff and then succeeds", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const result = await withTransientAIRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("429 RESOURCE_EXHAUSTED");
      return "ok";
    },
    {
      delaysMs: [10, 25],
      sleep: async (delayMs) => {
        waits.push(delayMs);
      },
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 25]);
});

test("AI retry does not retry permanent errors", async () => {
  let attempts = 0;
  await assert.rejects(
    withTransientAIRetry(
      async () => {
        attempts += 1;
        throw new Error("400 INVALID_ARGUMENT");
      },
      { delaysMs: [1], sleep: async () => undefined }
    ),
    /INVALID_ARGUMENT/
  );
  assert.equal(attempts, 1);
});
