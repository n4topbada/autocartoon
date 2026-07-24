import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PILOT_DIR = new URL("../public/balloon-pilot/", import.meta.url);
const PILOT_NAMES = [
  "dialogue",
  "soft",
  "whisper",
  "wavy",
  "thought",
  "radial-thought",
  "cloud",
  "shout",
  "scream",
  "electric",
  "broadcast",
  "double",
] as const;

type WhiteComponent = {
  area: number;
  height: number;
  width: number;
};

async function whiteComponents(name: string, width: number) {
  const source = new URL(`${name}.svg`, PILOT_DIR);
  const { data, info } = await sharp(fileURLToPath(source))
    .resize({ width })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const white = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * info.channels;
    white[index] = data[offset] >= 245
      && data[offset + 1] >= 245
      && data[offset + 2] >= 245
      && data[offset + 3] >= 220
      ? 1
      : 0;
  }

  const components: WhiteComponent[] = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (!white[start] || visited[start]) continue;

    const stack = [start];
    visited[start] = 1;
    let area = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < info.width ? index + 1 : -1,
        y > 0 ? index - info.width : -1,
        y + 1 < info.height ? index + info.width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && white[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (area >= 4) {
      components.push({
        area,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  return components.sort((a, b) => b.area - a.area);
}

test("solid pilot balloons keep body and tail as one visible region", async () => {
  for (const name of ["dialogue", "soft", "wavy", "cloud", "shout", "scream", "electric", "broadcast"]) {
    const large = await whiteComponents(name, 720);
    const small = await whiteComponents(name, 180);

    assert.equal(large.length, 1, `${name} has an internal seam at large size`);
    assert.equal(small.length, 1, `${name} has an internal seam at small size`);
    assert.ok(large[0].width > large[0].height, `${name} lost its horizontal silhouette`);
    assert.ok(small[0].area > 3_000, `${name} fill became unreadable at small size`);
  }
});

test("whisper balloon is one filled path with a deliberate dashed outline", async () => {
  const svg = await readFile(new URL("whisper.svg", PILOT_DIR), "utf8");
  assert.equal(svg.match(/<path\b/g)?.length, 1);
  assert.match(svg, /stroke-dasharray="12 10"/);
  assert.doesNotMatch(svg, /<line\b/);
});

test("double balloon has only its intentional inner outline", async () => {
  const large = await whiteComponents("double", 720);
  const small = await whiteComponents("double", 180);

  assert.equal(large.length, 2);
  assert.equal(small.length, 2);
  assert.ok(large[0].area > large[1].area * 0.2);
  assert.ok(small[1].area > 400, "double balloon inner area disappeared at small size");
});

test("pilot thought balloon keeps one body and three intentional thought bubbles", async () => {
  const large = await whiteComponents("thought", 720);
  const small = await whiteComponents("thought", 180);

  assert.equal(large.length, 4);
  assert.equal(small.length, 4);
  assert.ok(large[0].area > large[1].area * 20, "thought body must dominate the tail bubbles");
  assert.ok(small[3].area >= 8, "the smallest thought bubble must remain legible");
});

test("radial thought master keeps a blank oval surrounded by dense lines at 360 degrees", async () => {
  const svg = await readFile(new URL("radial-thought.svg", PILOT_DIR), "utf8");
  assert.ok((svg.match(/M\d/g) ?? []).length >= 120, "radial thought needs a dense line field");
  assert.match(svg, /<ellipse[^>]+fill="#fff"[^>]*\/>/);

  const { data, info } = await sharp(fileURLToPath(new URL("radial-thought.svg", PILOT_DIR)))
    .resize({ width: 180 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const darkCount = (left: number, top: number, right: number, bottom: number) => {
    let count = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset + 3] > 120 && data[offset] < 80 && data[offset + 1] < 80 && data[offset + 2] < 80) count += 1;
      }
    }
    return count;
  };

  assert.ok(darkCount(45, 4, 135, 31) > 20, "top radial lines disappeared");
  assert.ok(darkCount(45, 94, 135, 124) > 20, "bottom radial lines disappeared");
  assert.ok(darkCount(5, 30, 38, 96) > 20, "left radial lines disappeared");
  assert.ok(darkCount(142, 30, 179, 96) > 20, "right radial lines disappeared");
});

test("pilot SVG masters preserve stroke width while scaling", async () => {
  for (const name of PILOT_NAMES) {
    const svg = await readFile(new URL(`${name}.svg`, PILOT_DIR), "utf8");
    const metadata = await sharp(fileURLToPath(new URL(`${name}.svg`, PILOT_DIR))).metadata();

    assert.equal(metadata.format, "svg");
    assert.match(svg, /vector-effect="non-scaling-stroke"/);
    assert.match(svg, /stroke-linejoin="round"/);
    assert.match(svg, /stroke-linecap="round"/);
  }
});

test("pilot gallery exposes every approved balloon master", async () => {
  const html = await readFile(new URL("index.html", PILOT_DIR), "utf8");
  for (const name of PILOT_NAMES) {
    assert.match(html, new RegExp(`\\["${name}",`));
  }
  assert.match(html, /12종/);
});
