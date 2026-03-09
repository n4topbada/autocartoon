import { NextRequest, NextResponse } from "next/server";
import { generate, type GenerationMode } from "@/lib/generation-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { presetId, mode, prompt, background, inputImage } = body as {
      presetId: string;
      mode: GenerationMode;
      prompt: string;
      background?: string;
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
      inputImage,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Generation error:", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
