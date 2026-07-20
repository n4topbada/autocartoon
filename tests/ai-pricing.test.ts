import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_PRICING_POLICY,
  IMAGE_MODEL_PRICING,
  apiUsdToCredits,
  getImageModelPriceByApiModel,
  getImageGenerationCredits,
  getVideoGenerationCredits,
  isImageResolutionSupported,
} from "../src/lib/ai-pricing";

test("pricing policy applies 1.5x markup after USD conversion", () => {
  assert.equal(AI_PRICING_POLICY.creditKrw, 12);
  assert.equal(AI_PRICING_POLICY.markupMultiplier, 1.5);
  assert.equal(AI_PRICING_POLICY.usdToKrw, 1_500);
  assert.equal(apiUsdToCredits(1), 188);
});

test("image price table converts every supported model and resolution", () => {
  assert.equal(getImageGenerationCredits("nano-banana-2", "1K"), 13);
  assert.equal(getImageGenerationCredits("nano-banana-2", "2K"), 19);
  assert.equal(getImageGenerationCredits("nano-banana-pro", "1K"), 26);
  assert.equal(getImageGenerationCredits("nano-banana-pro", "2K"), 26);
  assert.equal(getImageGenerationCredits("nano-banana-2-lite", "1K"), 7);
  assert.equal(getImageGenerationCredits("gpt-image-2", "1K"), 10);
  assert.equal(getImageGenerationCredits("gpt-image-2", "2K"), 21);
  assert.equal(IMAGE_MODEL_PRICING["gpt-image-2"].availability, "planned");
  assert.equal(getImageModelPriceByApiModel("gemini-3.1-flash-image")?.thinkingLevel, "MINIMAL");
  assert.equal(getImageModelPriceByApiModel("gemini-3-pro-image")?.thinkingLevel, undefined);
});

test("unsupported image resolutions are explicit", () => {
  assert.equal(isImageResolutionSupported("nano-banana-2-lite", "1K"), true);
  assert.equal(isImageResolutionSupported("nano-banana-2-lite", "2K"), false);
  assert.throws(
    () => getImageGenerationCredits("nano-banana-2-lite", "2K"),
    /지원하지 않습니다/
  );
});

test("video prices are rounded once for the complete request", () => {
  assert.equal(getVideoGenerationCredits("veo", "720p", 5, false), 75);
  assert.equal(getVideoGenerationCredits("veo", "1080p", 8, true), 180);
  assert.equal(getVideoGenerationCredits("seedance", "720p", 6, true), 135);
  assert.equal(getVideoGenerationCredits("seedance", "1080p", 15, false), 1_041);
});
