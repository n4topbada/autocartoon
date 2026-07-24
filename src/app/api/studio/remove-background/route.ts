import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { AuthError, requireAuth } from "@/lib/auth";
import { IMAGE_MODEL_PRICING } from "@/lib/ai-pricing";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import { isCreditError, withCreditCharge } from "@/lib/credit-service";
import {
  findForegroundBounds,
  findOpaquePixelBounds,
  getForegroundFocusRegion,
  type PixelBounds,
  type PixelRegion,
} from "@/lib/corner-cutout";
import { generateContent, type GeminiRequest } from "@/lib/gemini";
import { isGoogleImageConfigured } from "@/lib/image-generation";
import { getPublicPlatformAIError } from "@/lib/platform-ai";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CUTOUT_MODEL = IMAGE_MODEL_PRICING["nano-banana-2"].apiModel;
const CHROMA_CANDIDATES = [
  { hex: "#00FF00", rgb: [0, 255, 0] as const },
  { hex: "#FF00FF", rgb: [255, 0, 255] as const },
  { hex: "#00FFFF", rgb: [0, 255, 255] as const },
] as const;

type CutoutAspectRatio = NonNullable<GeminiRequest["aspectRatio"]>;

function colorDistance(r: number, g: number, b: number, target: readonly number[]) {
  return Math.hypot(r - target[0], g - target[1], b - target[2]);
}

async function alignForeground(
  pixels: Buffer,
  width: number,
  height: number,
  sourceBounds: PixelBounds | null
) {
  const generatedBounds = findOpaquePixelBounds(new Uint8ClampedArray(pixels), width, height);
  if (!sourceBounds || !generatedBounds) return pixels;
  const sourceWidth = sourceBounds.maxX - sourceBounds.minX + 1;
  const sourceHeight = sourceBounds.maxY - sourceBounds.minY + 1;
  const generatedWidth = generatedBounds.maxX - generatedBounds.minX + 1;
  const generatedHeight = generatedBounds.maxY - generatedBounds.minY + 1;
  const cropped = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .extract({
      left: generatedBounds.minX,
      top: generatedBounds.minY,
      width: generatedWidth,
      height: generatedHeight,
    })
    .resize(sourceWidth, sourceHeight, { fit: "fill" })
    .raw()
    .toBuffer();
  const aligned = Buffer.alloc(pixels.length);
  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceOffset = y * sourceWidth * 4;
    const targetOffset = ((sourceBounds.minY + y) * width + sourceBounds.minX) * 4;
    cropped.copy(aligned, targetOffset, sourceOffset, sourceOffset + sourceWidth * 4);
  }
  return aligned;
}

async function chooseChromaKey(source: Buffer) {
  const sample = await sharp(source)
    .resize(96, 96, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return CHROMA_CANDIDATES
    .map((candidate) => ({
      candidate,
      score: Array.from({ length: Math.floor(sample.length / 4) }, (_, index) => index * 4)
        .reduce((count, offset) => {
          if (sample[offset + 3] < 32) return count;
          return count + (colorDistance(sample[offset], sample[offset + 1], sample[offset + 2], candidate.rgb) < 105 ? 1 : 0);
        }, 0),
    }))
    .sort((a, b) => a.score - b.score)[0].candidate;
}

function closestAspectRatio(width: number, height: number): CutoutAspectRatio {
  const ratio = width / height;
  const options: Array<[CutoutAspectRatio, number]> = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
  ];
  return options.sort((a, b) => Math.abs(a[1] - ratio) - Math.abs(b[1] - ratio))[0][0];
}

async function prepareCutoutSource(
  source: Buffer,
  width: number,
  height: number,
  sourceBounds: PixelBounds | null,
  mimeType: string
) {
  const focusRegion = getForegroundFocusRegion(sourceBounds, width, height);
  if (!focusRegion || !sourceBounds) {
    return {
      buffer: source,
      width,
      height,
      mimeType,
      bounds: sourceBounds,
      focusRegion: null as PixelRegion | null,
    };
  }

  const buffer = await sharp(source)
    .extract({
      left: focusRegion.x,
      top: focusRegion.y,
      width: focusRegion.width,
      height: focusRegion.height,
    })
    .png()
    .toBuffer();
  return {
    buffer,
    width: focusRegion.width,
    height: focusRegion.height,
    mimeType: "image/png",
    bounds: {
      minX: sourceBounds.minX - focusRegion.x,
      minY: sourceBounds.minY - focusRegion.y,
      maxX: sourceBounds.maxX - focusRegion.x,
      maxY: sourceBounds.maxY - focusRegion.y,
    },
    focusRegion,
  };
}

async function restoreCutoutFrame(
  cutout: Buffer,
  width: number,
  height: number,
  focusRegion: PixelRegion | null
) {
  if (!focusRegion) return cutout;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cutout, left: focusRegion.x, top: focusRegion.y }])
    .png()
    .toBuffer();
}

async function makeChromaTransparent(
  generated: Buffer,
  width: number,
  height: number,
  chromaRgb: readonly number[],
  sourceBounds: PixelBounds | null
) {
  const normalized = await sharp(generated)
    .resize(width, height, {
      fit: "contain",
      background: {
        r: chromaRgb[0],
        g: chromaRgb[1],
        b: chromaRgb[2],
        alpha: 1,
      },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = normalized.data;
  let transparentPixels = 0;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 245) {
      transparentPixels += 1;
      continue;
    }
    const distance = colorDistance(pixels[offset], pixels[offset + 1], pixels[offset + 2], chromaRgb);
    if (distance <= 42) {
      pixels[offset + 3] = 0;
      transparentPixels += 1;
    } else if (distance < 115) {
      pixels[offset + 3] = Math.min(255, Math.round(((distance - 42) / 73) * 255));
      transparentPixels += 1;
    }
  }

  if (transparentPixels < width * height * 0.005) {
    throw new Error("AI가 배경을 충분히 분리하지 못했습니다. 다시 시도해주세요.");
  }
  if (!findOpaquePixelBounds(new Uint8ClampedArray(pixels), width, height)) {
    throw new Error("AI가 작은 전경 물체를 유지하지 못해 결과를 적용하지 않았습니다. 다시 시도해주세요.");
  }
  const aligned = await alignForeground(pixels, width, height, sourceBounds);
  return sharp(aligned, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({
      provider: "nano-banana-2",
      configured: isGoogleImageConfigured(),
      credits: AI_CREDIT_COSTS.cutout,
      maxBytes: MAX_IMAGE_BYTES,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "누끼 연결 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isGoogleImageConfigured()) {
      return NextResponse.json(
        { error: "Nano Banana 이미지 API가 아직 연결되지 않았습니다.", code: "provider_not_configured" },
        { status: 503 }
      );
    }

    const input = await req.formData().catch(() => null);
    const image = input?.get("image");
    if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type) || image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "12MB 이하 PNG, JPG, WEBP 이미지를 선택해주세요." }, { status: 400 });
    }
    const source = Buffer.from(await image.arrayBuffer());
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: "이미지 크기를 읽지 못했습니다." }, { status: 400 });
    }
    const sourcePixels = await sharp(source)
      .resize(metadata.width, metadata.height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const sourceBounds = findForegroundBounds(
      new Uint8ClampedArray(sourcePixels),
      metadata.width,
      metadata.height
    );
    const workImage = await prepareCutoutSource(
      source,
      metadata.width,
      metadata.height,
      sourceBounds,
      image.type
    );
    const chroma = await chooseChromaKey(workImage.buffer);

    const output = await withCreditCharge(
      session.userId,
      {
        units: AI_CREDIT_COSTS.cutout,
        source: "cutout",
        referenceId: `cutout:${session.userId}:${randomUUID()}`,
        note: "Nano Banana AI 누끼",
      },
      async () => {
        const result = await generateContent({
          model: CUTOUT_MODEL,
          aspectRatio: closestAspectRatio(workImage.width, workImage.height),
          imageSize: "1K",
          modalities: ["IMAGE"],
          referenceImages: [{ base64: workImage.buffer.toString("base64"), mimeType: workImage.mimeType }],
          prompt: [
            "배경 제거 전용 이미지 편집 작업이다. 첫 번째 입력 이미지의 전경 피사체만 정확히 분리한다.",
            "인물이나 물체의 얼굴, 신체, 외곽선, 색, 글자, 의상, 소품, 그림체와 해상도를 바꾸거나 새로 그리지 않는다.",
            "피사체가 매우 작은 곤충, 아이콘, 얇은 선 또는 점 크기여도 배경으로 판단하거나 삭제하지 않는다. 보이는 전경 픽셀을 빠짐없이 유지한다.",
            "원래 배경, 그림자, 반사, 바닥, 주변 사물은 모두 제거한다.",
            `제거된 모든 배경은 단 하나의 완전 균일한 크로마키 색 ${chroma.hex}로 채운다. 그라데이션, 무늬, 그림자, 테두리는 금지한다.`,
            "피사체 가장자리와 머리카락·반투명 부분은 깨끗하고 자연스럽게 보존한다.",
            "입력 이미지의 피사체 위치, 크기, 여백, 구도를 정확히 유지한다. 중앙 정렬, 이동, 확대, 축소, 크롭을 하지 않는다.",
            "결과 이미지는 설명 없이 한 장만 반환한다.",
          ].join("\n"),
        });
        const generated = result.images[0];
        if (!generated) throw new Error("AI가 누끼 결과 이미지를 반환하지 않았습니다.");
        const cutout = await makeChromaTransparent(
          Buffer.from(generated.base64, "base64"),
          workImage.width,
          workImage.height,
          chroma.rgb,
          workImage.bounds
        );
        return restoreCutoutFrame(
          cutout,
          metadata.width!,
          metadata.height!,
          workImage.focusRegion
        );
      }
    );

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isCreditError(error)) {
      return NextResponse.json({ error: error.message, traceId: error.traceId }, { status: error.status });
    }
    console.error("Canvas remove-background error:", error);
    return NextResponse.json(
      { error: getPublicPlatformAIError(error, "이미지 배경을 제거하지 못했습니다.") },
      { status: 502 }
    );
  }
}
