import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createGoogleCodeVerifier,
  createGoogleOAuthState,
  validateGoogleOAuthState,
} from "../src/lib/google-auth";

test("Google OAuth state is high-entropy and must match exactly", () => {
  const state = createGoogleOAuthState();

  assert.ok(state.length >= 40);
  assert.equal(validateGoogleOAuthState(state, state), true);
  assert.equal(validateGoogleOAuthState(state + "x", state), false);
  assert.equal(validateGoogleOAuthState(null, state), false);
});

test("Google OAuth uses a PKCE-sized verifier", () => {
  const verifier = createGoogleCodeVerifier();
  assert.ok(verifier.length >= 64);
});

test("Google OAuth supports an authenticated account-link intent", async () => {
  const [entrySource, callbackSource] = await Promise.all([
    readFile("src/app/api/auth/google/route.ts", "utf8"),
    readFile("src/app/api/auth/google/callback/route.ts", "utf8"),
  ]);

  assert.match(entrySource, /GOOGLE_OAUTH_INTENT_COOKIE/);
  assert.match(entrySource, /intent === "link"/);
  assert.match(entrySource, /requireAuth\(\)/);
  assert.match(callbackSource, /linkGoogleToCurrentAccount/);
  assert.match(callbackSource, /temporaryPasswordHash: null/);
  assert.match(callbackSource, /session\.authMethod = "google"/);
});
