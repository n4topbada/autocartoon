import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_CREDIT_COSTS,
  CREDIT_PRODUCTS,
  CREDIT_UNIT_PRICE_KRW,
  getCreditProduct,
  getGenerationCreditCost,
  getProductBonusRate,
  getProductTotalCredits,
} from "../src/lib/credit-products";

test("credit products use unique server-owned codes and positive values", () => {
  assert.equal(new Set(CREDIT_PRODUCTS.map((product) => product.code)).size, CREDIT_PRODUCTS.length);
  for (const product of CREDIT_PRODUCTS) {
    assert.ok(product.credits > 0);
    assert.ok(product.amountKrw > 0);
    assert.equal(getCreditProduct(product.code), product);
  }
  assert.equal(getCreditProduct("not-a-product"), undefined);
});

test("product total credits include advertised bonus so purchasers receive them", () => {
  for (const product of CREDIT_PRODUCTS) {
    const bonus = "bonusCredits" in product ? product.bonusCredits : 0;
    assert.equal(getProductTotalCredits(product), product.credits + bonus);
    assert.ok(getProductTotalCredits(product) >= product.credits);
  }
  const creator = getCreditProduct("creator");
  assert.ok(creator && getProductTotalCredits(creator) > creator.credits);
});

test("credit products follow the 12 won unit policy and advertised bonus rates", () => {
  assert.deepEqual(
    CREDIT_PRODUCTS.map((product) => ({
      code: product.code,
      amountKrw: product.amountKrw,
      credits: product.credits,
      bonusCredits: "bonusCredits" in product ? product.bonusCredits : 0,
      bonusRate: getProductBonusRate(product),
    })),
    [
      { code: "light", amountKrw: 1_200, credits: 100, bonusCredits: 0, bonusRate: 0 },
      { code: "starter", amountKrw: 6_000, credits: 500, bonusCredits: 100, bonusRate: 20 },
      { code: "creator", amountKrw: 24_000, credits: 2_000, bonusCredits: 500, bonusRate: 25 },
      { code: "studio", amountKrw: 96_000, credits: 8_000, bonusCredits: 3_000, bonusRate: 37.5 },
    ],
  );

  for (const product of CREDIT_PRODUCTS) {
    assert.equal(product.amountKrw, product.credits * CREDIT_UNIT_PRICE_KRW);
  }
});

test("image generation cost scales by output count and resolution", () => {
  assert.equal(getGenerationCreditCost("image", {}), AI_CREDIT_COSTS.image1k);
  assert.equal(
    getGenerationCreditCost("background", { count: 3, imageSize: "2K" }),
    57
  );
  assert.equal(
    getGenerationCreditCost("image", { count: 999, imageSize: "1K" }),
    63
  );
  assert.equal(
    getGenerationCreditCost("image", { imageModel: "nano-banana-pro", imageSize: "2K" }),
    26
  );
});

test("video generation cost includes duration, resolution, and audio options", () => {
  assert.equal(
    getGenerationCreditCost("video", { durationSeconds: 5, resolution: "720p", generateAudio: false }),
    75
  );
  assert.equal(
    getGenerationCreditCost("video", { durationSeconds: 8, resolution: "1080p", generateAudio: true }),
    180
  );
  assert.equal(
    getGenerationCreditCost("video", {
      provider: "seedance",
      durationSeconds: 6,
      resolution: "720p",
      generateAudio: true,
    }),
    135
  );
  assert.equal(
    getGenerationCreditCost("video", {
      provider: "seedance",
      durationSeconds: 15,
      resolution: "1080p",
      generateAudio: false,
    }),
    1_041
  );
});

test("browser MP4 assembly does not consume AI credits", () => {
  assert.equal(getGenerationCreditCost("short", { source: "browser-ffmpeg" }), 0);
});

test("high-quality cutout has an explicit positive credit cost", () => {
  assert.equal(AI_CREDIT_COSTS.cutout, 25);
});
