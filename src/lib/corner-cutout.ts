export interface CornerCutoutResult {
  pixels: Uint8ClampedArray;
  removedPixels: number;
  retainedPixels: number;
  seedCount: number;
  excludedCorner: number | null;
}

export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RgbColor = readonly [number, number, number];

export interface GeneratedCutoutCleanupResult {
  pixels: Uint8ClampedArray;
  transparentCoverage: number;
  opaquePixels: number;
  bounds: PixelBounds | null;
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

function pixelColorDistance(
  pixels: Uint8ClampedArray,
  offset: number,
  color: RgbColor
) {
  return Math.hypot(
    pixels[offset] - color[0],
    pixels[offset + 1] - color[1],
    pixels[offset + 2] - color[2]
  );
}

function pixelMatchesBackground(
  pixels: Uint8ClampedArray,
  offset: number,
  seeds: CornerColor[],
  toleranceSquared: number
) {
  const alpha = pixels[offset + 3];
  for (const seed of seeds) {
    if (alpha < 16 && seed.a < 16) return true;
    if (alpha < 16 || seed.a < 16) continue;
    const red = pixels[offset] - seed.r;
    const green = pixels[offset + 1] - seed.g;
    const blue = pixels[offset + 2] - seed.b;
    if (red * red + green * green + blue * blue <= toleranceSquared) return true;
  }
  return false;
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
    const opaqueBounds = findOpaquePixelBounds(source, width, height);
    if (!opaqueBounds) return null;
    const opaqueWidth = opaqueBounds.maxX - opaqueBounds.minX + 1;
    const opaqueHeight = opaqueBounds.maxY - opaqueBounds.minY + 1;
    const cropped = new Uint8ClampedArray(opaqueWidth * opaqueHeight * 4);
    for (let y = 0; y < opaqueHeight; y += 1) {
      const sourceOffset = ((opaqueBounds.minY + y) * width + opaqueBounds.minX) * 4;
      const targetOffset = y * opaqueWidth * 4;
      cropped.set(source.subarray(sourceOffset, sourceOffset + opaqueWidth * 4), targetOffset);
    }
    const refined = removeConnectedCornerBackground(
      cropped,
      opaqueWidth,
      opaqueHeight,
      tolerance
    );
    const opaqueArea = opaqueWidth * opaqueHeight;
    const refinedBounds = findOpaquePixelBounds(refined.pixels, opaqueWidth, opaqueHeight);
    if (
      refinedBounds &&
      refined.retainedPixels > 0 &&
      refined.removedPixels >= Math.max(8, opaqueArea * 0.15)
    ) {
      const refinedArea =
        (refinedBounds.maxX - refinedBounds.minX + 1) *
        (refinedBounds.maxY - refinedBounds.minY + 1);
      if (refinedArea <= opaqueArea * 0.85) {
        return {
          minX: opaqueBounds.minX + refinedBounds.minX,
          minY: opaqueBounds.minY + refinedBounds.minY,
          maxX: opaqueBounds.minX + refinedBounds.maxX,
          maxY: opaqueBounds.minY + refinedBounds.maxY,
        };
      }
    }
    return opaqueBounds;
  }

  const cutout = removeConnectedCornerBackground(source, width, height, tolerance);
  if (cutout.removedPixels < minimumReliablePixels) return null;
  return findOpaquePixelBounds(cutout.pixels, width, height);
}

export function getForegroundFocusRegion(
  bounds: PixelBounds | null,
  width: number,
  height: number
): PixelRegion | null {
  if (!bounds || width <= 0 || height <= 0) return null;
  const subjectWidth = bounds.maxX - bounds.minX + 1;
  const subjectHeight = bounds.maxY - bounds.minY + 1;
  if (subjectWidth <= 0 || subjectHeight <= 0) return null;

  const subjectAreaRatio = (subjectWidth * subjectHeight) / (width * height);
  if (subjectAreaRatio >= 0.18) return null;

  const paddingX = Math.max(8, Math.ceil(subjectWidth * 0.45), Math.ceil(width * 0.01));
  const paddingY = Math.max(8, Math.ceil(subjectHeight * 0.45), Math.ceil(height * 0.01));
  const left = Math.max(0, bounds.minX - paddingX);
  const top = Math.max(0, bounds.minY - paddingY);
  const right = Math.min(width - 1, bounds.maxX + paddingX);
  const bottom = Math.min(height - 1, bounds.maxY + paddingY);
  const region = {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };

  return region.width * region.height < width * height * 0.82 ? region : null;
}

export function removeConnectedCornerBackground(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  requestedTolerance = 42,
  additionalBackgroundColors: readonly RgbColor[] = []
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
  const matchingSeeds = [
    ...seeds,
    ...additionalBackgroundColors.map((color, index) => ({
      index: corners.length + index,
      pixelIndex: -1,
      r: color[0],
      g: color[1],
      b: color[2],
      a: 255,
    })),
  ];
  const toleranceSquared = tolerance * tolerance;
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

  let opaquePixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 0) opaquePixels += 1;
  }
  let removedPixels = 0;
  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    visited[pixelIndex] = 2;
    const offset = pixelIndex * 4;
    const matchesBackground = pixelMatchesBackground(pixels, offset, matchingSeeds, toleranceSquared);
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

  return {
    pixels,
    removedPixels,
    retainedPixels: Math.max(0, opaquePixels - removedPixels),
    seedCount: seeds.length,
    excludedCorner,
  };
}

export function cleanGeneratedCutoutBackground(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  chromaColor: RgbColor,
  connectedTolerance = 92
): GeneratedCutoutCleanupResult {
  const connected = removeConnectedCornerBackground(
    source,
    width,
    height,
    connectedTolerance,
    [chromaColor]
  );
  const pixels = connected.pixels;
  let transparentCoverage = 0;
  let opaquePixels = 0;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    let alpha = pixels[offset + 3];
    const distance = pixelColorDistance(pixels, offset, chromaColor);
    if (distance <= 42) {
      alpha = 0;
    } else if (distance < 115) {
      alpha = Math.min(alpha, Math.round(((distance - 42) / 73) * 255));
    }
    pixels[offset + 3] = alpha;
    transparentCoverage += (255 - alpha) / 255;
    if (alpha >= 16) opaquePixels += 1;
  }

  return {
    pixels,
    transparentCoverage,
    opaquePixels,
    bounds: findOpaquePixelBounds(pixels, width, height),
  };
}
