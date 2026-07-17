import assert from "node:assert/strict";
import test from "node:test";
import {
  getClientIp,
  hashRegistrationIp,
  MAX_NEW_ACCOUNTS_PER_IP,
} from "../src/lib/signup-guard";

test("uses the trusted client position added by Google frontend forwarding", () => {
  const ip = getClientIp(
    new Headers({
      "x-forwarded-for": "forged-value, 203.0.113.7, 35.191.0.1",
    }),
  );

  assert.equal(ip, "203.0.113.7");
});

test("uses the single forwarded address when no proxy pair exists", () => {
  assert.equal(
    getClientIp(new Headers({ "x-forwarded-for": "2001:db8::7" })),
    "2001:db8::7",
  );
});

test("does not trust X-Real-IP as a production signup source", () => {
  assert.equal(
    getClientIp(new Headers({ "x-real-ip": "203.0.113.7" }), true),
    null,
  );
});

test("hashes addresses with an HMAC instead of persisting the address", () => {
  const ip = "203.0.113.7";
  const secret = "a".repeat(32);
  const hash = hashRegistrationIp(ip, secret);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, ip);
  assert.notEqual(hash, hashRegistrationIp(ip, "b".repeat(32)));
  assert.equal(MAX_NEW_ACCOUNTS_PER_IP, 2);
});
