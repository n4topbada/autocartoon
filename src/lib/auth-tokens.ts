import { createHash, randomBytes } from "node:crypto";

const AUTH_TOKEN_BYTES = 32;
const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export function createAuthToken() {
  return randomBytes(AUTH_TOKEN_BYTES).toString("base64url");
}

export function hashAuthToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isAuthTokenShape(token: unknown): token is string {
  return typeof token === "string" && AUTH_TOKEN_PATTERN.test(token);
}
