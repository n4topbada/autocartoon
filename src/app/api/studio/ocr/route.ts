import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import { isCreditError, withCreditCharge } from "@/lib/credit-service";
import { generatePlatformTextContent, getPublicPlatformAIError } from "@/lib/platform-ai";

export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BASE64_LENGTH = Math.ceil((4 * 1024 * 1024) / 3) * 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.image)) {
      return NextResponse.json({ error: "추출할 이미지가 필요합니다." }, { status: 400 });
    }
    const base64 = typeof body.image.base64 === "string" ? body.image.base64 : "";
    const mimeType = typeof body.image.mimeType === "string" ? body.image.mimeType : "";
    if (
      !base64 ||
      base64.length > MAX_BASE64_LENGTH ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      !ALLOWED_TYPES.has(mimeType)
    ) {
      return NextResponse.json({ error: "4MB 이하 PNG, JPG, WEBP 이미지를 사용해주세요." }, { status: 400 });
    }

    const text = await withCreditCharge(
      session.userId,
      { units: AI_CREDIT_COSTS.ocr, source: "ocr" },
      async () => {
        const response = await generatePlatformTextContent({
          contents: [{
            role: "user",
            parts: [
              { text: "이미지에 실제로 보이는 글자만 읽어 원래 줄바꿈 순서대로 출력하세요. 설명, 마크다운, 추측은 추가하지 마세요. 글자가 없으면 빈 문자열을 출력하세요." },
              { inlineData: { data: base64, mimeType } },
            ],
          }],
          config: {
            temperature: 0.1,
            maxOutputTokens: 2_048,
            abortSignal: AbortSignal.timeout(50_000),
          },
        });
        return response.text?.trim() || "";
      }
    );
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isCreditError(error)) {
      return NextResponse.json({ error: error.message, traceId: error.traceId }, { status: error.status });
    }
    console.error("Canvas OCR error:", error);
    return NextResponse.json(
      { error: getPublicPlatformAIError(error, "이미지에서 글자를 추출하지 못했습니다.") },
      { status: 500 }
    );
  }
}
