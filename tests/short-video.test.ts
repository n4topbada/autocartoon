import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeExpandedVideoPrompt,
  VIDEO_PROMPT_RESPONSE_SCHEMA,
} from "../src/lib/short-video-prompt";
import {
  getAllowedVideoDurations,
  isAllowedVideoDuration,
  normalizeVideoProvider,
} from "../src/lib/video-providers";

test("video providers normalize unknown values to Veo", () => {
  assert.equal(normalizeVideoProvider("seedance"), "seedance");
  assert.equal(normalizeVideoProvider("SEEDANCE"), "seedance");
  assert.equal(normalizeVideoProvider("vertex"), "veo");
  assert.equal(normalizeVideoProvider(undefined), "veo");
});

test("provider duration limits match each generation API", () => {
  assert.deepEqual(getAllowedVideoDurations("veo"), [4, 6, 8]);
  assert.equal(isAllowedVideoDuration("veo", 5), false);
  assert.equal(isAllowedVideoDuration("veo", 8), true);
  assert.deepEqual(getAllowedVideoDurations("seedance"), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(isAllowedVideoDuration("seedance", 15), true);
  assert.equal(isAllowedVideoDuration("seedance", 16), false);
  assert.equal(isAllowedVideoDuration("seedance", 6.5), false);
});

test("expanded prompt normalization trims and caps structured output", () => {
  const result = normalizeExpandedVideoPrompt({
    prompt: "  A continuous close-up camera move follows the hero through a rainy alley.  ",
    negativePrompt: "  subtitles, watermark  ",
  });
  assert.equal(result.prompt, "A continuous close-up camera move follows the hero through a rainy alley.");
  assert.equal(result.negativePrompt, "subtitles, watermark");
  assert.deepEqual(VIDEO_PROMPT_RESPONSE_SCHEMA.required, ["prompt", "negativePrompt"]);
});

test("expanded prompt normalization rejects malformed or empty output", () => {
  assert.throws(() => normalizeExpandedVideoPrompt(null));
  assert.throws(() => normalizeExpandedVideoPrompt({ prompt: "too short" }));
});
