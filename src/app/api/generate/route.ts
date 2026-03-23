import { NextRequest, NextResponse } from "next/server";
import { generate, type GenerationMode } from "@/lib/generation-service";
import { requireAuth, AuthError } from "@/lib/auth";
import { checkAndDeductCredit } from "@/lib/credit-service";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    // 크레딧 차감
    const creditResult = await checkAndDeductCredit(session.userId);
    if (!creditResult.ok) {
      return NextResponse.json({ error: creditResult.error }, { status: 402 });
    }

    const body = await req.json();
    const { presetId, mode, prompt, background, backgroundImageId, inputImage, inputImages } = body as {
      presetId: string;
      mode: GenerationMode;
      prompt: string;
      background?: string;
      backgroundImageId?: string;
      inputImage?: { base64: string; mimeType: string };
      inputImages?: { base64: string; mimeType: string }[];
    };

    if (!presetId || !mode || !prompt) {
      return NextResponse.json(
        { error: "presetId, mode, prompt 는 필수입니다." },
        { status: 400 }
      );
    }

    if (!["text", "sketch", "edit", "transform"].includes(mode)) {
      return NextResponse.json(
        { error: "mode는 text, sketch, edit, transform 중 하나여야 합니다." },
        { status: 400 }
      );
    }

    const result = await generate({
      presetId,
      userId: session.userId,
      mode,
      prompt,
      background,
      backgroundImageId,
      inputImage,
      inputImages,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Generation error:", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
