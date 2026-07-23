import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertWonyDatabaseTarget,
  assertWonyRuntimeDatabase,
  isWonyCloudRuntime,
} from "../src/lib/database-target";

const localUrl =
  "postgresql://wony_dev:secret@127.0.0.1:5433/autocartoon_dev?schema=public";
const productionUrl =
  "postgresql://wony:secret@localhost/autocartoon?host=%2Fcloudsql%2Fwonybananabot%3Aasia-northeast3%3Awony-postgres";

test("the guarded local target accepts only Wony development Cloud SQL proxy", () => {
  const target = assertWonyDatabaseTarget(localUrl, "local");
  assert.equal(target.database, "autocartoon_dev");
  assert.equal(target.port, "5433");

  for (const invalidUrl of [
    "postgresql://user:secret@203.0.113.10:5432/cynder",
    "postgresql://user:secret@example.neon.tech:5432/neondb",
    "postgresql://wony:secret@127.0.0.1:5433/autocartoon",
    "postgresql://wony_dev:secret@127.0.0.1:5432/autocartoon_dev",
  ]) {
    assert.throws(
      () => assertWonyDatabaseTarget(invalidUrl, "local"),
      /Refusing to use a non-Wony local database/
    );
  }
});

test("the production target requires the Wony Cloud SQL socket", () => {
  const target = assertWonyDatabaseTarget(productionUrl, "production");
  assert.equal(target.database, "autocartoon");

  assert.throws(
    () => assertWonyDatabaseTarget(localUrl, "production"),
    /Refusing to use a non-Wony production database/
  );
  assert.throws(
    () =>
      assertWonyDatabaseTarget(
        "postgresql://wony:secret@localhost/autocartoon?host=%2Fcloudsql%2Fcynder%3Aregion%3Adb",
        "production"
      ),
    /Refusing to use a non-Wony production database/
  );
});

test("runtime mode is selected from Cloud Run markers, not NODE_ENV", () => {
  assert.equal(isWonyCloudRuntime({ NODE_ENV: "production" }), false);
  assert.equal(isWonyCloudRuntime({ K_SERVICE: "wonybananabot" }), true);
  assert.doesNotThrow(() =>
    assertWonyRuntimeDatabase({
      NODE_ENV: "production",
      DATABASE_URL: localUrl,
    })
  );
  assert.doesNotThrow(() =>
    assertWonyRuntimeDatabase({
      K_SERVICE: "wonybananabot",
      DATABASE_URL: productionUrl,
    })
  );
});

test("database guard errors never reveal passwords", () => {
  const password = "do-not-print-this-password";
  assert.throws(
    () =>
      assertWonyDatabaseTarget(
        `postgresql://user:${password}@203.0.113.10:5432/cynder`,
        "local"
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(password));
      return true;
    }
  );
});

test("Prisma config overrides inherited local variables and guards Cloud Run", () => {
  const source = readFileSync(path.resolve("prisma.config.ts"), "utf8");
  assert.match(source, /override:\s*true/);
  assert.match(source, /CLOUD_RUN_JOB/);
  assert.match(source, /autocartoon_dev/);
  assert.match(source, /wonybananabot:asia-northeast3:wony-postgres/);
});
