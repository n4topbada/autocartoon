import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const WONY_DATABASE_POLICY = Object.freeze({
  project: "wonybananabot",
  instance: "wonybananabot:asia-northeast3:wony-postgres",
  localDatabase: "autocartoon_dev",
  productionDatabase: "autocartoon",
  localHost: "127.0.0.1",
  localPort: "5433",
  localUser: "wony_dev",
  productionUser: "wony",
  productionSocket: "/cloudsql/wonybananabot:asia-northeast3:wony-postgres",
});

export const SAFE_BUILD_DATABASE_URL =
  "postgresql://wony_dev:build-only@127.0.0.1:5433/autocartoon_dev?schema=public";

function parseDatabaseUrl(value) {
  if (!value) {
    throw new Error("DATABASE_URL is missing.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }

  return {
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    socket: url.searchParams.get("host") || "",
    user: decodeURIComponent(url.username),
  };
}

function describeTarget(target) {
  const socket = target.socket ? `, socket=${target.socket}` : "";
  return `host=${target.host}:${target.port}, database=${target.database}, user=${target.user}${socket}`;
}

export function assertWonyLocalDatabase(value) {
  const target = parseDatabaseUrl(value);
  const validHosts = new Set(["127.0.0.1", "localhost"]);
  const valid =
    validHosts.has(target.host) &&
    target.port === WONY_DATABASE_POLICY.localPort &&
    target.database === WONY_DATABASE_POLICY.localDatabase &&
    target.user === WONY_DATABASE_POLICY.localUser &&
    !target.socket;

  if (!valid) {
    throw new Error(
      [
        "Refusing to use a non-Wony development database.",
        `Expected 127.0.0.1:${WONY_DATABASE_POLICY.localPort}/${WONY_DATABASE_POLICY.localDatabase} as ${WONY_DATABASE_POLICY.localUser}.`,
        `Received ${describeTarget(target)}.`,
      ].join(" ")
    );
  }

  return target;
}

export function assertWonyProductionDatabase(value) {
  const target = parseDatabaseUrl(value);
  const valid =
    ["127.0.0.1", "localhost"].includes(target.host) &&
    target.database === WONY_DATABASE_POLICY.productionDatabase &&
    target.user === WONY_DATABASE_POLICY.productionUser &&
    target.socket === WONY_DATABASE_POLICY.productionSocket;

  if (!valid) {
    throw new Error(
      [
        "Refusing to use a non-Wony production database.",
        `Expected ${WONY_DATABASE_POLICY.productionDatabase} through ${WONY_DATABASE_POLICY.productionSocket}.`,
        `Received ${describeTarget(target)}.`,
      ].join(" ")
    );
  }

  return target;
}

export function assertWonyProjectMetadata(environment) {
  const failures = [];
  if (environment.WONY_GCP_PROJECT !== WONY_DATABASE_POLICY.project) {
    failures.push(`WONY_GCP_PROJECT=${environment.WONY_GCP_PROJECT || "missing"}`);
  }
  if (environment.WONY_CLOUD_SQL_INSTANCE !== WONY_DATABASE_POLICY.instance) {
    failures.push(
      `WONY_CLOUD_SQL_INSTANCE=${environment.WONY_CLOUD_SQL_INSTANCE || "missing"}`
    );
  }
  if (environment.WONY_DATABASE_NAME !== WONY_DATABASE_POLICY.localDatabase) {
    failures.push(`WONY_DATABASE_NAME=${environment.WONY_DATABASE_NAME || "missing"}`);
  }
  if (failures.length > 0) {
    throw new Error(`Wony project metadata is invalid: ${failures.join(", ")}.`);
  }
}

export function assertWonyLocalEnvironment(environment) {
  assertWonyProjectMetadata(environment);
  return assertWonyLocalDatabase(environment.DATABASE_URL);
}

export function isWonyCloudRuntime(environment = process.env) {
  return Boolean(
    environment.K_SERVICE ||
      environment.CLOUD_RUN_JOB ||
      environment.CLOUD_RUN_EXECUTION
  );
}

export function loadWonyProjectEnvironment({
  root = process.cwd(),
  nodeEnv = process.env.NODE_ENV || "development",
} = {}) {
  const environment = { ...process.env };
  const environmentFiles = [
    ".env",
    `.env.${nodeEnv}`,
    ".env.local",
    `.env.${nodeEnv}.local`,
  ];

  for (const file of environmentFiles) {
    const filePath = path.join(root, file);
    if (!existsSync(filePath)) continue;
    Object.assign(environment, parseEnv(readFileSync(filePath, "utf8")));
  }

  return environment;
}

export function applySafeBuildEnvironment(environment) {
  environment.DATABASE_URL = SAFE_BUILD_DATABASE_URL;
  environment.WONY_GCP_PROJECT = WONY_DATABASE_POLICY.project;
  environment.WONY_CLOUD_SQL_INSTANCE = WONY_DATABASE_POLICY.instance;
  environment.WONY_DATABASE_NAME = WONY_DATABASE_POLICY.localDatabase;
  return environment;
}
