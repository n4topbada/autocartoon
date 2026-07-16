import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_CREDIT_COSTS,
  CREDIT_PRODUCTS,
  getCreditProduct,
  getGenerationCreditCost,
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

test("image generation cost scales by output count and resolution", () => {
  assert.equal(getGenerationCreditCost("image", {}), AI_CREDIT_COSTS.image1k);
  assert.equal(
    getGenerationCreditCost("background", { count: 3, imageSize: "2K" }),
    AI_CREDIT_COSTS.image2k * 3
  );
  assert.equal(
    getGenerationCreditCost("image", { count: 999, imageSize: "1K" }),
    AI_CREDIT_COSTS.image1k * 5
  );
});

test("video generation cost includes duration, resolution, and audio options", () => {
  assert.equal(
    getGenerationCreditCost("video", { durationSeconds: 5, resolution: "720p", generateAudio: false }),
    AI_CREDIT_COSTS.videoBase
  );
  assert.equal(
    getGenerationCreditCost("video", { durationSeconds: 8, resolution: "1080p", generateAudio: true }),
    AI_CREDIT_COSTS.videoBase +
      AI_CREDIT_COSTS.videoEightSeconds +
      AI_CREDIT_COSTS.video1080p +
      AI_CREDIT_COSTS.videoAudio
  );
});
