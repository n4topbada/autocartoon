import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanGeneratedCutoutBackground,
  findForegroundBounds,
  getForegroundFocusRegion,
  removeConnectedCornerBackground,
} from "../src/lib/corner-cutout";

function image(width: number, height: number, color: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return pixels;
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, color: [number, number, number, number]) {
  pixels.set(color, (y * width + x) * 4);
}

test("연결된 코너 유사색만 투명하게 만든다", () => {
  const pixels = image(5, 5, [245, 245, 245, 255]);
  setPixel(pixels, 5, 2, 2, [40, 80, 140, 255]);
  const result = removeConnectedCornerBackground(pixels, 5, 5, 20);
  assert.equal(result.removedPixels, 24);
  assert.equal(result.pixels[(2 * 5 + 2) * 4 + 3], 255);
  assert.equal(result.pixels[3], 0);
});

test("네 코너 중 하나가 명백한 예외면 시작 색에서 제외한다", () => {
  const pixels = image(5, 5, [240, 240, 240, 255]);
  setPixel(pixels, 5, 0, 0, [210, 25, 35, 255]);
  const result = removeConnectedCornerBackground(pixels, 5, 5, 28);
  assert.equal(result.seedCount, 3);
  assert.equal(result.excludedCorner, 0);
  assert.equal(result.pixels[3], 255);
  assert.equal(result.pixels[(4 * 5 + 4) * 4 + 3], 0);
});

test("배경과 같은 색이어도 연결이 끊긴 내부 영역은 보존한다", () => {
  const pixels = image(7, 7, [250, 250, 250, 255]);
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 5; x += 1) setPixel(pixels, 7, x, y, [20, 20, 20, 255]);
  }
  setPixel(pixels, 7, 3, 3, [250, 250, 250, 255]);
  const result = removeConnectedCornerBackground(pixels, 7, 7, 16);
  assert.equal(result.pixels[(3 * 7 + 3) * 4 + 3], 255);
  assert.equal(result.pixels[3], 0);
});

test("흰 배경의 한 픽셀짜리 검은 전경도 높은 강도에서 보존한다", () => {
  const pixels = image(101, 101, [255, 255, 255, 255]);
  setPixel(pixels, 101, 50, 50, [0, 0, 0, 255]);

  const result = removeConnectedCornerBackground(pixels, 101, 101, 120);

  assert.equal(result.retainedPixels, 1);
  assert.equal(result.pixels[(50 * 101 + 50) * 4 + 3], 255);
  assert.equal(result.pixels[3], 0);
});

test("AI 결과의 흰색·연녹색 잔여 배경을 제거하고 작은 검은 전경은 보존한다", () => {
  const pixels = image(101, 101, [255, 255, 255, 255]);
  setPixel(pixels, 101, 50, 50, [0, 0, 0, 255]);
  for (let y = 24; y <= 76; y += 1) {
    setPixel(pixels, 101, 28, y, [205, 255, 205, 255]);
    setPixel(pixels, 101, 72, y, [205, 255, 205, 255]);
  }
  setPixel(pixels, 101, 10, 10, [0, 255, 0, 255]);

  const result = cleanGeneratedCutoutBackground(
    pixels,
    101,
    101,
    [0, 255, 0]
  );

  assert.equal(result.opaquePixels, 1);
  assert.equal(result.pixels[(50 * 101 + 50) * 4 + 3], 255);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[(28 * 101 + 50) * 4 + 3], 0);
  assert.equal(result.pixels[(10 * 101 + 10) * 4 + 3], 0);
});

test("AI 결과에 크로마가 고립되어 있어도 전역 투명 처리한다", () => {
  const pixels = image(21, 21, [30, 30, 30, 255]);
  setPixel(pixels, 21, 10, 10, [0, 255, 0, 255]);

  const result = cleanGeneratedCutoutBackground(
    pixels,
    21,
    21,
    [0, 255, 0],
    8
  );

  assert.equal(result.pixels[(10 * 21 + 10) * 4 + 3], 0);
});

test("작은 전경은 AI가 놓치지 않도록 여백을 둔 확대 영역을 만든다", () => {
  assert.deepEqual(
    getForegroundFocusRegion({ minX: 49, minY: 50, maxX: 51, maxY: 52 }, 100, 100),
    { x: 41, y: 42, width: 19, height: 19 }
  );
  assert.equal(
    getForegroundFocusRegion({ minX: 10, minY: 10, maxX: 89, maxY: 89 }, 100, 100),
    null
  );
});

test("불투명 단색 배경에서도 실제 전경의 좌표 경계를 찾는다", () => {
  const pixels = image(8, 7, [250, 250, 250, 255]);
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 3; x <= 6; x += 1) setPixel(pixels, 8, x, y, [210, 20, 30, 255]);
  }

  assert.deepEqual(findForegroundBounds(pixels, 8, 7, 20), {
    minX: 3,
    minY: 2,
    maxX: 6,
    maxY: 5,
  });
});

test("투명 여백 안의 불투명 단색 배경에서도 작은 실제 전경을 찾는다", () => {
  const pixels = image(12, 16, [0, 0, 0, 0]);
  for (let y = 2; y <= 13; y += 1) {
    for (let x = 1; x <= 10; x += 1) {
      setPixel(pixels, 12, x, y, [255, 255, 255, 255]);
    }
  }
  setPixel(pixels, 12, 5, 7, [0, 0, 0, 255]);
  setPixel(pixels, 12, 6, 7, [0, 0, 0, 255]);

  assert.deepEqual(findForegroundBounds(pixels, 12, 16, 20), {
    minX: 5,
    minY: 7,
    maxX: 6,
    maxY: 7,
  });
});

test("코너에서 신뢰할 배경을 찾지 못하면 억지 위치 보정을 하지 않는다", () => {
  const pixels = image(12, 12, [20, 30, 40, 255]);
  setPixel(pixels, 12, 0, 0, [255, 0, 0, 255]);
  setPixel(pixels, 12, 11, 0, [0, 255, 0, 255]);
  setPixel(pixels, 12, 0, 11, [0, 0, 255, 255]);
  setPixel(pixels, 12, 11, 11, [255, 255, 0, 255]);

  assert.equal(findForegroundBounds(pixels, 12, 12, 8), null);
});
