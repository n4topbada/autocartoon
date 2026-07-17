import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/auth/register/route";

test("new password-based registrations are disabled", async () => {
  const response = await POST();
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.match(body.error || "", /카카오 또는 Google/);
});
