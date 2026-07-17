export type LogSeverity =
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type LogField = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogField>;
type CompactLogField = Exclude<LogField, undefined>;
type CompactLogFields<T extends LogFields> = {
  [Key in keyof T]-?: Exclude<T[Key], undefined>;
};
export type StructuredLogEntry<T extends LogFields = LogFields> = {
  severity: LogSeverity;
  message: string;
  event: string;
  component: string;
  revision: string;
} & CompactLogFields<T> & Record<string, CompactLogField>;

const MAX_LOG_VALUE_LENGTH = 2_000;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_PATTERN = /\b(api[_ -]?key|authorization|password|secret|token)\s*[:=]\s*[^\s,;]+/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9+/_-]{80,}={0,2}\b/g;

function truncate(value: string): string {
  const bounded = value.length > MAX_LOG_VALUE_LENGTH
    ? `${value.slice(0, MAX_LOG_VALUE_LENGTH)}...`
    : value;
  return bounded
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(SECRET_PATTERN, "$1=[redacted]")
    .replace(LONG_TOKEN_PATTERN, "[redacted-long-value]");
}

function compactFields(fields: LogFields): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [[key, typeof value === "string" ? truncate(value) : value]];
    })
  );
}

function requestTraceFields(request?: Request): LogFields {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const traceHeader = request?.headers.get("x-cloud-trace-context");
  const traceId = traceHeader?.split("/")[0];
  if (!project || !traceId || !TRACE_ID_PATTERN.test(traceId)) return {};
  return {
    "logging.googleapis.com/trace": `projects/${project}/traces/${traceId}`,
  };
}

export function cloudTaskLogFields(request: Request): LogFields {
  return {
    taskName: request.headers.get("x-cloudtasks-taskname"),
    taskRetryCount: request.headers.get("x-cloudtasks-taskretrycount"),
    taskExecutionCount: request.headers.get("x-cloudtasks-taskexecutioncount"),
    taskPreviousResponse: request.headers.get("x-cloudtasks-taskpreviousresponse"),
    taskRetryReason: request.headers.get("x-cloudtasks-taskretryreason"),
  };
}

export function buildLogEntry<T extends LogFields = LogFields>(
  severity: LogSeverity,
  event: string,
  message: string,
  fields: T = {} as T,
  request?: Request
): StructuredLogEntry<T> {
  return {
    ...compactFields(fields),
    ...compactFields(requestTraceFields(request)),
    severity,
    message: truncate(message),
    event,
    component: "wonybananabot",
    revision: process.env.K_REVISION || "local",
  } as StructuredLogEntry<T>;
}

export function logEvent(
  severity: LogSeverity,
  event: string,
  message: string,
  fields: LogFields = {},
  request?: Request
): void {
  const line = JSON.stringify(buildLogEntry(severity, event, message, fields, request));
  if (severity === "CRITICAL" || severity === "ERROR") {
    console.error(line);
  } else if (severity === "WARNING") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logError(
  event: string,
  message: string,
  error: unknown,
  fields: LogFields = {},
  request?: Request
): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message : String(error);
  logEvent(
    "ERROR",
    event,
    message,
    { ...fields, errorName, errorMessage },
    request
  );
}
