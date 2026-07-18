import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { getCanvasBlobUrls } from "../src/lib/canvas-storage";
import { compositeGeneratedInsideMask } from "../src/lib/generation-service";
import {
  bubblePointToCanvas,
  canvasPointToBubble,
  createBubble,
  hitTestBubble,
} from "../src/lib/bubble-draw";

async function solidPng(width: number, height: number, rgba: { r: number; g: number; b: number; alpha: number }) {
  return sharp({ create: { width, height, channels: 4, background: rgba } }).png().toBuffer();
}

test("masked AI edit preserves every pixel outside the mask", async () => {
  const width = 8;
  const height = 8;
  const source = await solidPng(width, height, { r: 220, g: 20, b: 60, alpha: 1 });
  const generated = await solidPng(width, height, { r: 30, g: 100, b: 240, alpha: 1 });
  const maskPixels = Buffer.alloc(width * height * 4);
  for (let y = 2; y < 6; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * width + x) * 4;
      maskPixels.fill(255, offset, offset + 4);
    }
  }
  const mask = await sharp(maskPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const result = await compositeGeneratedInsideMask(
    { base64: source.toString("base64"), mimeType: "image/png" },
    { base64: generated.toString("base64"), mimeType: "image/png" },
    { base64: mask.toString("base64"), mimeType: "image/png" }
  );
  const pixels = await sharp(Buffer.from(result.base64, "base64")).raw().toBuffer();

  const pixel = (x: number, y: number) => Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
  assert.deepEqual(pixel(0, 0), [220, 20, 60, 255]);
  assert.deepEqual(pixel(7, 7), [220, 20, 60, 255]);
  assert.deepEqual(pixel(2, 2), [30, 100, 240, 255]);
  assert.deepEqual(pixel(5, 5), [30, 100, 240, 255]);
});

test("masked AI edit treats opaque black pixels as protected", async () => {
  const width = 8;
  const height = 8;
  const source = await solidPng(width, height, { r: 220, g: 20, b: 60, alpha: 1 });
  const generated = await solidPng(width, height, { r: 30, g: 100, b: 240, alpha: 1 });
  const maskPixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    maskPixels[index * 4 + 3] = 255;
  }
  for (let y = 2; y < 6; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * width + x) * 4;
      maskPixels.fill(255, offset, offset + 4);
    }
  }
  const mask = await sharp(maskPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const result = await compositeGeneratedInsideMask(
    { base64: source.toString("base64"), mimeType: "image/png" },
    { base64: generated.toString("base64"), mimeType: "image/png" },
    { base64: mask.toString("base64"), mimeType: "image/png" }
  );
  const pixels = await sharp(Buffer.from(result.base64, "base64")).raw().toBuffer();
  const pixel = (x: number, y: number) => Array.from(
    pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)
  );

  assert.deepEqual(pixel(0, 0), [220, 20, 60, 255]);
  assert.deepEqual(pixel(7, 7), [220, 20, 60, 255]);
  assert.deepEqual(pixel(2, 2), [30, 100, 240, 255]);
  assert.deepEqual(pixel(5, 5), [30, 100, 240, 255]);
});

test("rotated canvas objects preserve coordinate round trips and hit testing", () => {
  const bubble = {
    ...createBubble("rectangle", 100, 100),
    width: 100,
    height: 60,
    rotation: 90,
  };
  const canvasPoint = bubblePointToCanvas(bubble, 130, 85);
  const restored = canvasPointToBubble(bubble, canvasPoint.x, canvasPoint.y);

  assert.ok(Math.abs(restored.x - 130) < 0.0001);
  assert.ok(Math.abs(restored.y - 85) < 0.0001);
  assert.equal(hitTestBubble(100, 140, bubble), "body");
  assert.equal(hitTestBubble(140, 100, bubble), null);
});

test("canvas storage refs include only non-empty layer pixel URLs", () => {
  assert.deepEqual(getCanvasBlobUrls({
    version: 2,
    layers: [
      { pixelUrl: "/api/media/layer-a" },
      { pixelUrl: "" },
      { pixelUrl: null },
      { name: "text-only" },
      { pixelUrl: "gs://bucket/layer-b.png" },
    ],
  }), ["/api/media/layer-a", "gs://bucket/layer-b.png"]);
  assert.deepEqual(getCanvasBlobUrls(null), []);
  assert.deepEqual(getCanvasBlobUrls({ layers: "invalid" }), []);
});
