import assert from "node:assert/strict";
import test from "node:test";
import { LEGAL_DOCUMENTS, LEGAL_SERVICE } from "../src/lib/legal-documents";

test("정책 문서 3종은 국내 서비스의 실제 기능 상태를 반영한다", () => {
  assert.deepEqual(Object.keys(LEGAL_DOCUMENTS), ["terms", "privacy", "refund"]);
  assert.equal(LEGAL_SERVICE.serviceName, "워니바나나봇");

  const allText = JSON.stringify(LEGAL_DOCUMENTS);
  assert.match(allText, /대한민국/);
  assert.match(allText, /현재는 수집하지 않음/);
  assert.match(allText, /운영 결제는 비활성 상태/);
  assert.match(allText, /국외 이전 가능성/);
  assert.doesNotMatch(allText, /ToonAgent|Paddle|AWS|Vercel/);
});

test("이용약관, 개인정보, 환불정책에 필수 운영 항목이 있다", () => {
  const termsIds = LEGAL_DOCUMENTS.terms.sections.map((section) => section.id);
  const privacyIds = LEGAL_DOCUMENTS.privacy.sections.map((section) => section.id);
  const refundIds = LEGAL_DOCUMENTS.refund.sections.map((section) => section.id);

  assert.ok(termsIds.includes("credits"));
  assert.ok(termsIds.includes("content-rights"));
  assert.ok(privacyIds.includes("retention"));
  assert.ok(privacyIds.includes("overseas"));
  assert.ok(refundIds.includes("used-credits"));
  assert.ok(refundIds.includes("consumption"));
});
