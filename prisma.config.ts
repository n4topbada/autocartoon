import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { defineConfig } from "prisma/config";

const policy = {
  localDatabase: "autocartoon_dev",
  localPort: "5433",
  localUser: "wony_dev",
  productionDatabase: "autocartoon",
  productionUser: "wony",
  productionSocket: "/cloudsql/wonybananabot:asia-northeast3:wony-postgres",
} as const;
const isCloudRun = Boolean(
  process.env.K_SERVICE ||
    process.env.CLOUD_RUN_JOB ||
    process.env.CLOUD_RUN_EXECUTION
);
const localEnvironmentPath = path.resolve(process.cwd(), ".env.local");

if (!isCloudRun) {
  if (existsSync(localEnvironmentPath)) {
    loadEnvFile({ path: localEnvironmentPath, override: true, quiet: true });
  } else {
    process.env.DATABASE_URL =
      "postgresql://wony_dev:build-only@127.0.0.1:5433/autocartoon_dev?schema=public";
  }
}

function assertDatabaseTarget(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is missing.");
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  const host = url.hostname.toLowerCase();
  const localHost = host === "127.0.0.1" || host === "localhost";
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(url.username);
  const port = url.port || "5432";
  const socket = url.searchParams.get("host") || "";
  const valid = isCloudRun
    ? localHost &&
      database === policy.productionDatabase &&
      user === policy.productionUser &&
      socket === policy.productionSocket
    : localHost &&
      port === policy.localPort &&
      database === policy.localDatabase &&
      user === policy.localUser &&
      !socket;

  if (!valid) {
    const mode = isCloudRun ? "production" : "development";
    throw new Error(
      `Refusing to load Prisma with a non-Wony ${mode} database target (${host}:${port}/${database}, user=${user}).`
    );
  }
}

assertDatabaseTarget(process.env.DATABASE_URL);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
