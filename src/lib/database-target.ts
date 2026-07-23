const WONY_DATABASE_POLICY = {
  localDatabase: "autocartoon_dev",
  localPort: "5433",
  localUser: "wony_dev",
  productionDatabase: "autocartoon",
  productionUser: "wony",
  productionSocket: "/cloudsql/wonybananabot:asia-northeast3:wony-postgres",
} as const;

type DatabaseTarget = {
  database: string;
  host: string;
  port: string;
  socket: string;
  user: string;
};

export type WonyDatabaseMode = "local" | "production";
type RuntimeEnvironment = Partial<NodeJS.ProcessEnv>;

function parseDatabaseUrl(value?: string): DatabaseTarget {
  if (!value) throw new Error("DATABASE_URL is missing.");

  let url: URL;
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

function describeTarget(target: DatabaseTarget) {
  const socket = target.socket ? `, socket=${target.socket}` : "";
  return `host=${target.host}:${target.port}, database=${target.database}, user=${target.user}${socket}`;
}

export function isWonyCloudRuntime(
  environment: RuntimeEnvironment = process.env
) {
  return Boolean(
    environment.K_SERVICE ||
      environment.CLOUD_RUN_JOB ||
      environment.CLOUD_RUN_EXECUTION
  );
}

export function assertWonyDatabaseTarget(
  value: string | undefined,
  mode: WonyDatabaseMode
) {
  const target = parseDatabaseUrl(value);
  const localHost = target.host === "127.0.0.1" || target.host === "localhost";
  const valid =
    mode === "production"
      ? localHost &&
        target.database === WONY_DATABASE_POLICY.productionDatabase &&
        target.user === WONY_DATABASE_POLICY.productionUser &&
        target.socket === WONY_DATABASE_POLICY.productionSocket
      : localHost &&
        target.port === WONY_DATABASE_POLICY.localPort &&
        target.database === WONY_DATABASE_POLICY.localDatabase &&
        target.user === WONY_DATABASE_POLICY.localUser &&
        !target.socket;

  if (!valid) {
    const expected =
      mode === "production"
        ? `${WONY_DATABASE_POLICY.productionDatabase} through ${WONY_DATABASE_POLICY.productionSocket}`
        : `127.0.0.1:${WONY_DATABASE_POLICY.localPort}/${WONY_DATABASE_POLICY.localDatabase} as ${WONY_DATABASE_POLICY.localUser}`;
    throw new Error(
      `Refusing to use a non-Wony ${mode} database. Expected ${expected}. Received ${describeTarget(target)}.`
    );
  }

  return target;
}

export function assertWonyRuntimeDatabase(
  environment: RuntimeEnvironment = process.env
) {
  const mode: WonyDatabaseMode = isWonyCloudRuntime(environment)
    ? "production"
    : "local";
  return assertWonyDatabaseTarget(environment.DATABASE_URL, mode);
}
