import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyCaptionStyleToCanvas,
  applyWatermarkToCanvas,
  createCanvasPresetDocument,
  createCaptionBubble,
  deleteWatermarkFromCanvas,
  normalizeCaptionSettings,
  normalizeWatermarkSettings,
  parseCanvasPresetDocument,
} from "../src/lib/canvas-presets";

test("canvas preset settings are normalized to safe render ranges", () => {
  const watermark = normalizeWatermarkSettings({
    text: `  ${"x".repeat(200)}  `,
    fontSize: 999,
    margin: -30,
    outlineWidth: 99,
    textColor: "not-a-color",
    position: "bottom-left",
  });
  assert.equal(watermark.text.length, 120);
  assert.equal(watermark.fontSize, 160);
  assert.equal(watermark.margin, 0);
  assert.equal(watermark.outlineWidth, 16);
  assert.equal(watermark.textColor, "#ffffff");
  assert.equal(watermark.position, "bottom-left");

  const caption = normalizeCaptionSettings({ fontSize: 1, margin: 999, textColor: "#123456" });
  assert.equal(caption.fontSize, 12);
  assert.equal(caption.margin, 360);
  assert.equal(caption.textColor, "#123456");
});

test("watermark apply updates one stable preset and delete preserves unrelated objects", () => {
  const document = createCanvasPresetDocument({ width: 1080, height: 1350, aspect: "4:5" });
  const first = applyWatermarkToCanvas(document, { text: "first", position: "top-left" });
  const firstWatermark = first.layers.flatMap((layer) => layer.bubbles).find((bubble) => bubble.presetKind === "watermark");
  assert.ok(firstWatermark);
  assert.equal(firstWatermark.text, "first");

  const second = applyWatermarkToCanvas(first, { text: "second", position: "bottom-right" });
  const watermarks = second.layers.flatMap((layer) => layer.bubbles).filter((bubble) => bubble.presetKind === "watermark");
  assert.equal(watermarks.length, 1);
  assert.equal(watermarks[0].id, firstWatermark.id);
  assert.equal(watermarks[0].text, "second");
  assert.ok(watermarks[0].x > 540);
  assert.ok(watermarks[0].y > 675);

  const watermarkLayer = second.layers.find((layer) => layer.name === "워터마크");
  assert.ok(watermarkLayer);
  watermarkLayer.bubbles.push(createCaptionBubble(1080, 1350, "top", "keep me", {}));
  const deleted = deleteWatermarkFromCanvas(second);
  assert.equal(deleted.layers.flatMap((layer) => layer.bubbles).some((bubble) => bubble.presetKind === "watermark"), false);
  assert.equal(deleted.layers.flatMap((layer) => layer.bubbles).some((bubble) => bubble.text === "keep me"), true);
});

test("caption global style updates captions while leaving ordinary text untouched", () => {
  const document = createCanvasPresetDocument({ width: 800, height: 1100, aspect: "8:11" });
  document.layers.push({
    id: "caption-layer",
    name: "캡션·내레이션",
    pixelUrl: null,
    fillColor: null,
    background: null,
    bubbles: [
      createCaptionBubble(800, 1100, "top", "top caption", {}),
      createCaptionBubble(800, 1100, "bottom", "bottom caption", {}),
    ],
  });
  document.layers.push({
    id: "ordinary-layer",
    name: "일반 텍스트",
    pixelUrl: null,
    fillColor: null,
    background: null,
    bubbles: [{ ...createCaptionBubble(800, 1100, "top", "ordinary", {}), presetKind: undefined }],
  });

  const result = applyCaptionStyleToCanvas(document, {
    fontFamily: "monospace",
    fontWeight: "bold",
    textColor: "#ff0000",
    fontSize: 60,
    margin: 80,
  });
  assert.equal(result.updated, 2);
  const captions = result.canvas.layers[0].bubbles;
  assert.deepEqual(captions.map((bubble) => bubble.fontSize), [60, 60]);
  assert.deepEqual(captions.map((bubble) => bubble.textColor), ["#ff0000", "#ff0000"]);
  assert.equal(result.canvas.layers[1].bubbles[0].fontSize, 48);
});

test("serialized preset documents restore missing bubble render defaults", () => {
  const parsed = parseCanvasPresetDocument({
    version: 2,
    aspect: "1:1",
    width: 1080,
    height: 1080,
    layers: [{ id: "text", name: "텍스트", bubbles: [{ id: "bubble", type: "text", text: "hello" }] }],
  });
  assert.ok(parsed);
  assert.equal(parsed.layers[0].bubbles[0].x, 540);
  assert.equal(parsed.layers[0].bubbles[0].fillColor, "transparent");
  assert.equal(parsed.layers[0].bubbles[0].opacity, 1);
});

test("canvas parity UI exposes scoped presets, region OCR, and API-only cutout safely", async () => {
  const [editor, cutoutRoute] = await Promise.all([
    readFile("src/components/CanvasEditor.tsx", "utf8"),
    readFile("src/app/api/studio/remove-background/route.ts", "utf8"),
  ]);
  for (const label of ["현재 컷", "전체 컷", "범위", "상단 추가", "하단 추가", "사각형", "자유 선택", "API 연결 필요"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.match(editor, /downloadAllCanvasPages/);
  assert.match(cutoutRoute, /https:\/\/api\.remove\.bg\/v1\.0\/removebg/);
  assert.match(cutoutRoute, /X-Api-Key/);
  assert.ok(cutoutRoute.indexOf("if (!apiKey)") < cutoutRoute.indexOf("const output = await withCreditCharge"));
});
