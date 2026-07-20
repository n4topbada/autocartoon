import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OAuth signup does not block users who share an IP address", async () => {
  const [kakaoCallback, googleCallback, schema, migration] = await Promise.all([
    readFile("src/app/api/auth/kakao/callback/route.ts", "utf8"),
    readFile("src/app/api/auth/google/callback/route.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile(
      "prisma/migrations/20260720190000_remove_registration_ip_limit/migration.sql",
      "utf8",
    ),
  ]);

  assert.doesNotMatch(kakaoCallback, /SignupLimitError|reserveNewAccountSlot|signup_limit/);
  assert.doesNotMatch(googleCallback, /SignupLimitError|reserveNewAccountSlot|signup_limit/);
  assert.doesNotMatch(schema, /model RegistrationIp/);
  assert.match(migration, /DROP TABLE IF EXISTS "RegistrationIp"/);
});

test("provider identities and welcome grants keep database uniqueness", async () => {
  const [kakaoCallback, googleCallback, schema] = await Promise.all([
    readFile("src/app/api/auth/kakao/callback/route.ts", "utf8"),
    readFile("src/app/api/auth/google/callback/route.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
  ]);

  assert.match(schema, /kakaoId\s+String\?\s+@unique/);
  assert.match(schema, /googleId\s+String\?\s+@unique/);
  assert.match(kakaoCallback, /referenceKey:\s*`welcome:\$\{created\.id\}:grant`/);
  assert.match(googleCallback, /referenceKey:\s*"welcome:" \+ created\.id \+ ":grant"/);
  assert.match(schema, /referenceKey\s+String\s+@unique/);
});
