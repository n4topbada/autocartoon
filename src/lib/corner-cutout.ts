export interface CornerCutoutResult {
  pixels: Uint8ClampedArray;
  removedPixels: number;
  seedCount: number;
  excludedCorner: number | null;
}

export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CornerColor {
  index: number;
  pixelIndex: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

function colorDistance(left: CornerColor, right: CornerColor) {
  if (left.a < 16 && right.a < 16) return 0;
  if (left.a < 16 || right.a < 16) return 441;
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function pixelDistance(pixels: Uint8ClampedArray, offset: number, seed: CornerColor) {
  const alpha = pixels[offset + 3];
  if (alpha < 16 && seed.a < 16) return 0;
  if (alpha < 16 || seed.a < 16) return 441;
  return Math.hypot(
    pixels[offset] - seed.r,
    pixels[offset + 1] - seed.g,
    pixels[offset + 2] - seed.b
  );
}

function readCorner(pixels: Uint8ClampedArray, pixelIndex: number, index: number): CornerColor {
  const offset = pixelIndex * 4;
  return {
    index,
    pixelIndex,
    r: pixels[offset],
    g: pixels[offset + 1],
    b: pixels[offset + 2],
    a: pixels[offset + 3],
  };
}

function selectCornerSeeds(corners: CornerColor[], tolerance: number) {
  let best: { excluded: number; spread: number; distance: number } | null = null;
  for (const candidate of corners) {
    const cluster = corners.filter((corner) => corner.index !== candidate.index);
    const pairDistances = [
      colorDistance(cluster[0], cluster[1]),
      colorDistance(cluster[0], cluster[2]),
      colorDistance(cluster[1], cluster[2]),
    ];
    const spread = Math.max(...pairDistances);
    const distance = cluster.reduce((sum, corner) => sum + colorDistance(candidate, corner), 0) / cluster.length;
    if (!best || spread < best.spread || (spread === best.spread && distance > best.distance)) {
      best = { excluded: candidate.index, spread, distance };
    }
  }

  const clusterLimit = Math.max(18, tolerance * 0.9);
  const outlierLimit = Math.max(28, tolerance * 1.35, (best?.spread ?? 0) * 2.2 + 8);
  const excludedCorner = best && best.spread <= clusterLimit && best.distance > outlierLimit
    ? best.excluded
    : null;
  return {
    seeds: corners.filter((corner) => corner.index !== excludedCorner),
    excludedCorner,
  };
}

export function findOpaquePixelBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): PixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    if (pixels[pixelIndex * 4 + 3] < 16) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return maxX >= minX && maxY >= minY ? { minX, minY, maxX, maxY } : null;
}

export function findForegroundBounds(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 42
): PixelBounds | null {
  const pixelCount = width * height;
  let transparentPixels = 0;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (source[pixelIndex * 4 + 3] < 16) transparentPixels += 1;
  }
  const minimumReliablePixels = Math.max(8, pixelCount * 0.005);
  if (transparentPixels >= minimumReliablePixels) {
    return findOpaquePixelBounds(source, width, height);
  }

  const cutout = removeConnectedCornerBackground(source, width, height, tolerance);
  if (cutout.removedPixels < minimumReliablePixels) return null;
  return findOpaquePixelBounds(cutout.pixels, width, height);
}

export function removeConnectedCornerBackground(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  requestedTolerance = 42
): CornerCutoutResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("이미지 크기가 올바르지 않습니다.");
  }
  if (source.length !== width * height * 4) {
    throw new Error("이미지 픽셀 수와 크기가 일치하지 않습니다.");
  }
  const tolerance = Math.max(0, Math.min(255, requestedTolerance));
  const pixels = new Uint8ClampedArray(source);
  const cornerPixelIndexes = [0, width - 1, (height - 1) * width, width * height - 1];
  const corners = cornerPixelIndexes.map((pixelIndex, index) => readCorner(pixels, pixelIndex, index));
  const { seeds, excludedCorner } = selectCornerSeeds(corners, tolerance);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const seed of seeds) {
    if (visited[seed.pixelIndex]) continue;
    visited[seed.pixelIndex] = 1;
    queue[tail] = seed.pixelIndex;
    tail += 1;
  }

  let removedPixels = 0;
  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    visited[pixelIndex] = 2;
    const offset = pixelIndex * 4;
    const matchesBackground = seeds.some((seed) => pixelDistance(pixels, offset, seed) <= tolerance);
    if (!matchesBackground) continue;
    if (pixels[offset + 3] > 0) removedPixels += 1;
    pixels[offset + 3] = 0;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighbors = [
      x > 0 ? pixelIndex - 1 : -1,
      x + 1 < width ? pixelIndex + 1 : -1,
      y > 0 ? pixelIndex - width : -1,
      y + 1 < height ? pixelIndex + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }

  return { pixels, removedPixels, seedCount: seeds.length, excludedCorner };
}
