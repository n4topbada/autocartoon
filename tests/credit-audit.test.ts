import assert from "node:assert/strict";
import test from "node:test";
import {
  createCreditTraceId,
  getCreditAuditReference,
  verifyCreditBalance,
} from "../src/lib/credit-audit-core";
import {
  buildCreditAuditSummary,
  formatCreditAuditMetadataValue,
  getCreditAuditDirectionLabel,
  getCreditAuditOperationLabel,
  getCreditAuditSourceLabel,
  normalizeCreditAuditSearch,
} from "../src/lib/credit-audit-view";
import {
  sanitizeCreditAuditError,
  sanitizeCreditAuditMetadata,
} from "../src/lib/credit-audit";

test("credit balance verification accepts valid debit, credit, neutral, and failed attempts", () => {
  assert.equal(verifyCreditBalance({ status: "success", direction: "debit", units: 25, balanceBefore: 100, balanceAfter: 75 }), true);
  assert.equal(verifyCreditBalance({ status: "success", direction: "credit", units: 25, balanceBefore: 100, balanceAfter: 125 }), true);
  assert.equal(verifyCreditBalance({ status: "success", direction: "neutral", units: 25, balanceBefore: 100, balanceAfter: 100 }), true);
  assert.equal(verifyCreditBalance({ status: "failure", direction: "debit", units: 25, balanceBefore: 10, balanceAfter: 10 }), true);
});

test("credit balance verification catches mismatches and skips unavailable balances", () => {
  assert.equal(verifyCreditBalance({ status: "success", direction: "debit", units: 25, balanceBefore: 100, balanceAfter: 80 }), false);
  assert.equal(verifyCreditBalance({ status: "failure", direction: "credit", units: 25, balanceBefore: 100, balanceAfter: 125 }), false);
  assert.equal(verifyCreditBalance({ status: "success", direction: "credit", units: 25, balanceBefore: null, balanceAfter: 125 }), null);
});

test("credit trace IDs are stable per reference and different across references", () => {
  const first = createCreditTraceId("job:alpha");
  assert.match(first, /^CR-[A-F0-9]{12}$/);
  assert.equal(createCreditTraceId("job:alpha"), first);
  assert.notEqual(createCreditTraceId("job:beta"), first);
});

test("ledger suffixes collapse into one audit reference", () => {
  assert.equal(getCreditAuditReference("job:123:charge"), "job:123");
  assert.equal(getCreditAuditReference("job:123:refund"), "job:123");
  assert.equal(getCreditAuditReference("payment:123:credit"), "payment:123");
  assert.equal(getCreditAuditReference("custom:reference"), "custom:reference");
});

test("admin audit labels remain human readable", () => {
  assert.equal(getCreditAuditSourceLabel("character-designer"), "캐릭터 설계");
  assert.equal(getCreditAuditOperationLabel("payment_reconcile"), "결제 검증");
  assert.equal(getCreditAuditDirectionLabel("debit"), "사용·차감");
  assert.equal(buildCreditAuditSummary({ source: "coupon", operation: "grant", status: "failure" }), "쿠폰 크레딧 지급 실패");
  assert.equal(formatCreditAuditMetadataValue("amountKrw", 1200), "1,200원");
  assert.equal(normalizeCreditAuditSearch("  CR-123  "), "CR-123");
});

test("credit audit data redacts secrets and prompt payloads", () => {
  const metadata = sanitizeCreditAuditMetadata({
    provider: "vertex",
    prompt: "private character prompt",
    nested: { apiKey: "secret-api-key", count: 2 },
  });
  assert.deepEqual(metadata, {
    provider: "vertex",
    prompt: "[redacted]",
    nested: { apiKey: "[redacted]", count: 2 },
  });

  const sanitized = sanitizeCreditAuditError(
    new Error("provider failed ?token=secret-token Bearer secret-bearer")
  );
  assert.doesNotMatch(sanitized.message, /secret-token|secret-bearer/);
  assert.match(sanitized.message, /\[redacted\]/);
});
