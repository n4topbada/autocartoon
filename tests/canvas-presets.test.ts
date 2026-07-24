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

test("canvas parity UI exposes scoped presets, region OCR, and Nano Banana cutout safely", async () => {
  const [editor, cutoutRoute] = await Promise.all([
    readFile("src/components/CanvasEditor.tsx", "utf8"),
    readFile("src/app/api/studio/remove-background/route.ts", "utf8"),
  ]);
  for (const label of ["현재 컷", "전체 컷", "범위", "상단 추가", "하단 추가", "사각형", "자유 선택", "API 연결 필요", "실시간 미리보기", "누끼 강도"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.match(editor, /downloadAllCanvasPages/);
  assert.match(editor, /createCornerCutoutCanvas/);
  assert.match(editor, /CORNER_CUTOUT_PREVIEW_DEBOUNCE_MS/);
  assert.doesNotMatch(editor, /CORNER_CUTOUT_PREVIEW_MAX_SIDE/);
  assert.match(cutoutRoute, /generateContent/);
  assert.match(cutoutRoute, /nano-banana-2/);
  assert.match(cutoutRoute, /크로마키/);
  assert.match(cutoutRoute, /prepareCutoutSource/);
  assert.match(cutoutRoute, /getForegroundFocusRegion/);
  assert.match(cutoutRoute, /작은 전경 물체를 유지하지 못해 결과를 적용하지 않았습니다/);
  assert.ok(cutoutRoute.indexOf("if (!isGoogleImageConfigured())") < cutoutRoute.indexOf("const output = await withCreditCharge"));
});

test("canvas parity UI keeps the audited reference tool states and staged actions", async () => {
  const editor = await readFile("src/components/CanvasEditor.tsx", "utf8");
  const styles = await readFile("src/components/CanvasEditor.module.css", "utf8");

  for (const label of [
    "선택툴", "브러쉬", "지우개", "텍스트", "말풍선", "도형", "스포이트", "텍스트 추출",
    "텍스트 추가 (드래그)", "말풍선 추가 (드래그)", "도형 추가 (드래그)",
    "지울 영역을 칠한 뒤 적용하세요.", "투명", "감쪽", "지우기 적용",
    "모불모불", "구불구불", "선 투명도", "내부 투명도", "꼬리 폭",
    "모서리 둥글기", "테두리", "그라데이션", "각도", "비율",
    "직접 그리기", "자르기 적용", "자르기 취소",
  ]) {
    assert.ok(editor.includes(label), `missing audited canvas label: ${label}`);
  }

  assert.match(editor, /TEXT_QUICK_SIZES = \[16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 120\]/);
  assert.match(editor, /DIRECT_DRAW_COLORS = \["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"\]/);
  assert.match(editor, /applyTransparentEraser/);
  assert.match(editor, /applyStagedEraser/);
  assert.match(editor, /wony-canvas-custom-bubble/);
  assert.match(styles, /\.toolRail\s*\{/);
  assert.match(styles, /\.toolOptionsPanel\s*\{/);
  assert.match(styles, /\.directDrawBar/);
  assert.match(styles, /\.utilityDock/);
});
