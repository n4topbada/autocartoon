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
    const { presetId, mode, prompt, background, backgroundImageId, inputImage } = body as {
      presetId: string;
      mode: GenerationMode;
      prompt: string;
      background?: string;
      backgroundImageId?: string;
      inputImage?: { base64: string; mimeType: string };
    };

    if (!presetId || !mode || !prompt) {
      return NextResponse.json(
        { error: "presetId, mode, prompt 는 필수입니다." },
        { status: 400 }
      );
    }

    if (!["text", "sketch", "edit"].includes(mode)) {
      return NextResponse.json(
        { error: "mode는 text, sketch, edit 중 하나여야 합니다." },
        { status: 400 }
      );
    }

    const result = await generate({
      presetId,
      mode,
      prompt,
      background,
      backgroundImageId,
      inputImage,
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
