import assert from "node:assert/strict";
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
