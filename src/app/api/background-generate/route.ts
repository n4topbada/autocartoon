import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import { isCreditError, withCreditCharge } from "@/lib/credit-service";
import { generateContentForBackground } from "@/lib/gemini";
import { getPublicPlatformAIError } from "@/lib/platform-ai";

export const maxDuration = 120;

const MAX_ATTEMPTS_PER_IMAGE = 2;
const MAX_PROMPT_LENGTH = 10_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type InputImage = { base64: string; mimeType: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function generateBackgroundImage(args: { prompt: string; inputImage: InputImage }) {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_IMAGE; attempt++) {
    try {
      const result = await generateContentForBackground(args);
      if (result.images.length > 0) return result.images[0];
      errors.push(`Attempt ${attempt}: model returned no image`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown generation error");
    }
  }
  throw new Error(errors.at(-1) || "모델이 이미지를 반환하지 않았습니다.");
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.inputImage)) {
      return NextResponse.json({ error: "입력 이미지와 프롬프트가 필요합니다." }, { status: 400 });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const base64 = typeof body.inputImage.base64 === "string" ? body.inputImage.base64 : "";
    const mimeType = typeof body.inputImage.mimeType === "string" ? body.inputImage.mimeType : "";
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: "프롬프트는 10,000자 이하로 입력해주세요." }, { status: 400 });
    }
    if (
      !base64 ||
      base64.length > MAX_BASE64_LENGTH ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES ||
      !ALLOWED_IMAGE_TYPES.has(mimeType)
    ) {
      return NextResponse.json({ error: "4MB 이하 PNG, JPG, WEBP 이미지를 사용해주세요." }, { status: 400 });
    }

    const count = Math.max(1, Math.min(5, Number(body.count) || 1));
    const inputImage = { base64, mimeType };
    const results = await Promise.allSettled(
      Array.from({ length: count }, () =>
        withCreditCharge(
          session.userId,
          { units: AI_CREDIT_COSTS.image1k, source: "background-image" },
          () => generateBackgroundImage({ prompt, inputImage })
        )
      )
    );

    const images = results
      .filter((result): result is PromiseFulfilledResult<{ base64: string; mimeType: string }> => result.status === "fulfilled")
      .map((result) => result.value);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason as unknown);

    if (images.length === 0) {
      const creditFailure = failures.find(isCreditError);
      if (creditFailure) {
        return NextResponse.json({ error: creditFailure.message }, { status: creditFailure.status });
      }
      return NextResponse.json(
        { error: getPublicPlatformAIError(failures[0], "이미지 생성에 실패했습니다. 다시 시도해주세요.") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      images,
      errors: failures.length
        ? failures.map((error) => getPublicPlatformAIError(error, "일부 이미지 생성에 실패했습니다."))
        : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isCreditError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Background generation error:", error);
    return NextResponse.json(
      { error: getPublicPlatformAIError(error, "배경 이미지 생성에 실패했습니다. 다시 시도해주세요.") },
      { status: 500 }
    );
  }
}
