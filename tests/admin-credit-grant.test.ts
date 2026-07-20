import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CREDIT_GRANT_MAX,
  parseAdminCreditGrant,
} from "../src/lib/admin-credit-grant";

test("admin credit preset uses the server-owned product total", () => {
  const result = parseAdminCreditGrant({ creditProductCode: "studio" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.grant.amount, 11_000);
  assert.equal(result.grant.mode, "preset");
  assert.equal(result.grant.productCode, "studio");
  assert.match(result.grant.note, /96,000원/);
});

test("admin custom credit grant accepts positive safe integers", () => {
  const result = parseAdminCreditGrant({ addCredits: 10_000 });

  assert.deepEqual(result, {
    ok: true,
    grant: {
      amount: 10_000,
      mode: "custom",
      productCode: null,
      note: "관리자 수동 지급: 직접 입력",
    },
  });
});

test("admin credit grant rejects ambiguous and invalid requests", () => {
  assert.equal(parseAdminCreditGrant({}).ok, false);
  assert.equal(parseAdminCreditGrant({ creditProductCode: "missing" }).ok, false);
  assert.equal(parseAdminCreditGrant({ addCredits: 0 }).ok, false);
  assert.equal(parseAdminCreditGrant({ addCredits: ADMIN_CREDIT_GRANT_MAX + 1 }).ok, false);
  assert.equal(parseAdminCreditGrant({ addCredits: 10, creditProductCode: "light" }).ok, false);
});
