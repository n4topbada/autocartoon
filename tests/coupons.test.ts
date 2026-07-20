import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COUPON_CODE_PATTERN,
  COUPON_CREDITS,
  generateCouponCode,
  getCouponAvailability,
  normalizeCouponCode,
  parseCouponCampaignInput,
} from "../src/lib/coupons";

test("coupon rewards are fixed at 600 credits and codes avoid ambiguous characters", () => {
  assert.equal(COUPON_CREDITS, 600);
  const code = generateCouponCode(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.match(code, COUPON_CODE_PATTERN);
  assert.equal(code, "WONY-ABCD-EFGH");
  assert.doesNotMatch(code.slice(5), /[01ILO]/);
});

test("coupon input accepts a code or a complete QR URL", () => {
  assert.equal(normalizeCouponCode(" wony-abcd-efgh "), "WONY-ABCD-EFGH");
  assert.equal(
    normalizeCouponCode("https://example.com/coupon/WONY-ABCD-EFGH?campaign=lecture"),
    "WONY-ABCD-EFGH",
  );
  assert.equal(normalizeCouponCode("/coupon/WONY-ABCD-EFGH"), "WONY-ABCD-EFGH");
  assert.equal(normalizeCouponCode("not-a-coupon"), "");
  assert.equal(normalizeCouponCode("https://example.com/not-coupon/WONY-ABCD-EFGH"), "");
});

test("coupon campaign input validates dates and maximum redemptions", () => {
  const valid = parseCouponCampaignInput({
    title: "  AI 웹툰 강의  ",
    startsAt: "2026-08-01T09:00:00.000Z",
    endsAt: "2026-08-01T12:00:00.000Z",
    maxRedemptions: 100,
    active: true,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.title, "AI 웹툰 강의");
    assert.equal(valid.value.maxRedemptions, 100);
  }

  assert.equal(parseCouponCampaignInput({ title: "강의", maxRedemptions: 0 }).ok, false);
  assert.equal(parseCouponCampaignInput({
    title: "강의",
    startsAt: "2026-08-01T12:00:00.000Z",
    endsAt: "2026-08-01T09:00:00.000Z",
  }).ok, false);
});

test("coupon availability follows active, time, and quota boundaries", () => {
  const now = new Date("2026-08-01T10:00:00.000Z");
  const base = { active: true, startsAt: null, endsAt: null, maxRedemptions: 100, redeemedCount: 3 };
  assert.equal(getCouponAvailability(base, now), "available");
  assert.equal(getCouponAvailability({ ...base, active: false }, now), "inactive");
  assert.equal(getCouponAvailability({ ...base, startsAt: "2026-08-01T11:00:00.000Z" }, now), "not_started");
  assert.equal(getCouponAvailability({ ...base, endsAt: "2026-08-01T10:00:00.000Z" }, now), "expired");
  assert.equal(getCouponAvailability({ ...base, redeemedCount: 100 }, now), "exhausted");
});

test("coupon redemption has database and ledger idempotency boundaries", async () => {
  const [schema, redemptionSource, migration] = await Promise.all([
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/lib/coupon-redemption.ts", "utf8"),
    readFile("prisma/migrations/20260720223000_add_coupon_campaigns/migration.sql", "utf8"),
  ]);

  assert.match(schema, /@@unique\(\[campaignId, userId\]\)/);
  assert.match(schema, /code\s+String\s+@unique/);
  assert.match(redemptionSource, /prisma\.\$transaction/);
  assert.match(redemptionSource, /redeemedCount:\s*\{ increment: 1 \}/);
  assert.match(redemptionSource, /credits:\s*\{ increment: campaign\.credits \}/);
  assert.match(redemptionSource, /referenceKey: `coupon:\$\{campaign\.id\}:\$\{userId\}:grant`/);
  assert.match(migration, /CouponCampaign_credits_check/);
  assert.match(migration, /CouponCampaign_quota_check/);
  assert.match(migration, /CouponRedemption_campaignId_userId_key/);
});
