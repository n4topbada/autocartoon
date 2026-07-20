import { Prisma } from "@prisma/client";
import {
  createCreditTraceId,
  getCreditAuditReference,
  verifyCreditBalance,
} from "./credit-audit-core";
import {
  buildCreditAuditSummary,
  type CreditAuditDirection,
  type CreditAuditStatus,
} from "./credit-audit-view";
import { prisma } from "./prisma";

export {
  createCreditTraceId,
  getCreditAuditReference,
  verifyCreditBalance,
} from "./credit-audit-core";

export type CreditAuditTransaction = Prisma.TransactionClient;

type SafeJson = string | number | boolean | SafeJson[] | { [key: string]: SafeJson };

export type CreditAuditEventInput = {
  userId?: string | null;
  actorUserId?: string | null;
  ledgerId?: string | null;
  jobId?: string | null;
  traceId?: string;
  referenceId?: string | null;
  operation: string;
  direction: CreditAuditDirection;
  status: CreditAuditStatus;
  source: string;
  units?: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  balanceVerified?: boolean | null;
  reasonCode?: string | null;
  summary?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CreditLedgerAuditInput = {
  userId: string;
  actorUserId?: string | null;
  jobId?: string | null;
  referenceKey: string;
  referenceId?: string;
  traceId?: string;
  action: string;
  direction?: CreditAuditDirection;
  source: string;
  units: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  reasonCode?: string;
  summary?: string;
  metadata?: Record<string, unknown> | null;
};

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api.?key|prompt|base64|image.?data)/i;
const LONG_OPAQUE_VALUE = /^[A-Za-z0-9+/_=-]{96,}$/;

function sanitizeString(value: string, maxLength = 600) {
  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/([?&](?:token|key|secret|signature)=)[^&\s]+/gi, "$1[redacted]")
    .trim();
  if (LONG_OPAQUE_VALUE.test(normalized)) return "[large opaque value redacted]";
  return normalized.slice(0, maxLength);
}

function sanitizeValue(value: unknown, depth: number): SafeJson {
  if (depth > 3) return "[nested data omitted]";
  if (typeof value === "string") return sanitizeString(value, 400);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return "-";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, SafeJson> = {};
    for (const [key, nested] of Object.entries(value).slice(0, 30)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(nested, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 200);
}

export function sanitizeCreditAuditMetadata(
  metadata: Record<string, unknown> | null | undefined
): Prisma.InputJsonObject | undefined {
  if (!metadata) return undefined;
  return sanitizeValue(metadata, 0) as Prisma.InputJsonObject;
}

export function sanitizeCreditAuditError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      reasonCode: `PRISMA_${error.code}`,
      message: `데이터베이스 처리 오류 (${error.code})`,
    };
  }
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "OPERATION_FAILED";
    return { reasonCode: sanitizeString(code, 80), message: sanitizeString(error.message) };
  }
  return { reasonCode: "UNKNOWN_ERROR", message: "알 수 없는 오류" };
}

function inferDirection(action: string): CreditAuditDirection {
  if (["grant", "purchase", "refund"].includes(action)) return "credit";
  if (action === "charge") return "debit";
  return "neutral";
}

export async function createCreditAuditEvent(
  tx: CreditAuditTransaction,
  input: CreditAuditEventInput
) {
  const units = Number.isSafeInteger(input.units) && (input.units ?? 0) >= 0 ? input.units! : 0;
  const referenceId = input.referenceId || null;
  const balanceVerified = input.balanceVerified === undefined
    ? verifyCreditBalance({
        status: input.status,
        direction: input.direction,
        units,
        balanceBefore: input.balanceBefore,
        balanceAfter: input.balanceAfter,
      })
    : input.balanceVerified;

  return tx.creditAuditEvent.create({
    data: {
      userId: input.userId || null,
      actorUserId: input.actorUserId || null,
      ledgerId: input.ledgerId || null,
      jobId: input.jobId || null,
      traceId: input.traceId || createCreditTraceId(referenceId),
      referenceId,
      operation: input.operation,
      direction: input.direction,
      status: input.status,
      source: input.source,
      units,
      balanceBefore: input.balanceBefore ?? null,
      balanceAfter: input.balanceAfter ?? null,
      balanceVerified,
      reasonCode: input.reasonCode || null,
      summary: sanitizeString(input.summary || buildCreditAuditSummary(input), 180),
      errorMessage: input.errorMessage ? sanitizeString(input.errorMessage) : null,
      metadata: sanitizeCreditAuditMetadata(input.metadata),
    },
  });
}

export async function createCreditLedgerWithAudit(
  tx: CreditAuditTransaction,
  input: CreditLedgerAuditInput
) {
  const referenceId = input.referenceId || getCreditAuditReference(input.referenceKey);
  const traceId = input.traceId || createCreditTraceId(referenceId);
  const direction = input.direction || inferDirection(input.action);
  const ledger = await tx.creditLedger.create({
    data: {
      userId: input.userId,
      jobId: input.jobId || null,
      referenceKey: input.referenceKey,
      action: input.action,
      source: input.source,
      units: input.units,
      balanceAfter: input.balanceAfter,
      note: input.note,
    },
  });
  const audit = await createCreditAuditEvent(tx, {
    userId: input.userId,
    actorUserId: input.actorUserId,
    ledgerId: ledger.id,
    jobId: input.jobId,
    traceId,
    referenceId,
    operation: input.action,
    direction,
    status: "success",
    source: input.source,
    units: input.units,
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceAfter,
    reasonCode: input.reasonCode || "BALANCE_CHANGE_COMMITTED",
    summary: input.summary || input.note || undefined,
    metadata: input.metadata,
  });
  return { ledger, audit };
}

export async function recordCreditAuditSafely(input: CreditAuditEventInput) {
  try {
    const event = await prisma.$transaction((tx) => createCreditAuditEvent(tx, input));
    if (input.status === "failure") {
      console.error(JSON.stringify({
        event: "credit_operation_failed",
        traceId: event.traceId,
        source: event.source,
        operation: event.operation,
        reasonCode: event.reasonCode,
        userId: event.userId,
        jobId: event.jobId,
      }));
    }
    return event;
  } catch (auditError) {
    const safe = sanitizeCreditAuditError(auditError);
    console.error(JSON.stringify({
      event: "credit_audit_persist_failed",
      traceId: input.traceId || createCreditTraceId(input.referenceId),
      reasonCode: safe.reasonCode,
      message: safe.message,
    }));
    return null;
  }
}
