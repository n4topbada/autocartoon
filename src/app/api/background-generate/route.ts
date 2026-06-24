import { NextRequest, NextResponse } from "next/server";
import { generateContentForBackground } from "@/lib/gemini";
import { requireAuth, AuthError } from "@/lib/auth";
import { checkAndDeductCredit, refundDeductedCredit } from "@/lib/credit-service";

// Allow enough time for image generation on Vercel.
export const maxDuration = 120;

const MAX_ATTEMPTS_PER_IMAGE = 2;

type InputImage = { base64: string; mimeType: string };
type DeductResult = Awaited<ReturnType<typeof checkAndDeductCredit>>;

async function generateBackgroundImage(args: {
  prompt: string;
  inputImage: InputImage;
}) {
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

  throw new Error(errors[errors.length - 1] || "모델이 이미지를 반환하지 않았습니다.");
}

export async function POST(req: NextRequest) {
  let deducted: DeductResult | null = null;
  let sessionUserId: string | null = null;

  try {
    const session = await requireAuth();
    sessionUserId = session.userId;

    const body = await req.json();
    const { inputImage, prompt, count } = body as {
      inputImage: InputImage;
      prompt: string;
      count: number;
    };

    if (!inputImage?.base64 || !prompt) {
      return NextResponse.json(
        { error: "inputImage와 prompt는 필수입니다." },
        { status: 400 }
      );
    }

    const n = Math.max(1, Math.min(5, count || 1));

    const creditResult = await checkAndDeductCredit(session.userId);
    if (!creditResult.ok) {
      return NextResponse.json({ error: creditResult.error }, { status: 402 });
    }
    deducted = creditResult;

    const results = await Promise.allSettled(
      Array.from({ length: n }, () => generateBackgroundImage({ prompt, inputImage }))
    );

    const images: { base64: string; mimeType: string }[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        images.push(result.value);
      } else {
        errors.push(result.reason?.message || "알 수 없는 오류");
      }
    }

    if (images.length === 0) {
      await refundDeductedCredit(session.userId, deducted.source);
      deducted = null;
      return NextResponse.json(
        { error: errors[0] || "이미지 생성에 실패했습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    return NextResponse.json({ images, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (sessionUserId && deducted?.ok) {
      await refundDeductedCredit(sessionUserId, deducted.source);
    }

    console.error("Background generation error:", error);
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
