import { createHash, randomBytes } from "node:crypto";
import type { CreditAuditDirection, CreditAuditStatus } from "./credit-audit-view";

export function getCreditAuditReference(referenceKey: string) {
  return referenceKey.replace(/:(charge|refund|grant|credit|adjustment)$/, "");
}

export function createCreditTraceId(referenceId?: string | null) {
  const seed = referenceId || randomBytes(24).toString("hex");
  return `CR-${createHash("sha256").update(seed).digest("hex").slice(0, 12).toUpperCase()}`;
}

export function verifyCreditBalance(input: {
  status: CreditAuditStatus;
  direction: CreditAuditDirection;
  units: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
}) {
  if (input.balanceBefore === null || input.balanceBefore === undefined) return null;
  if (input.balanceAfter === null || input.balanceAfter === undefined) return null;
  const expected = input.status === "failure" || input.direction === "neutral"
    ? input.balanceBefore
    : input.direction === "credit"
      ? input.balanceBefore + input.units
      : input.balanceBefore - input.units;
  return expected === input.balanceAfter;
}
