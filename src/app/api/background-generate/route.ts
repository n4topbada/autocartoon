import { NextRequest, NextResponse } from "next/server";
import { generateContentForBackground } from "@/lib/gemini";
import { requireAuth, AuthError } from "@/lib/auth";
import { checkAndDeductCredit } from "@/lib/credit-service";

// 이미지 base64 전송을 위한 타임아웃 및 body 크기 설정
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    const creditResult = await checkAndDeductCredit(session.userId);
    if (!creditResult.ok) {
      return NextResponse.json({ error: creditResult.error }, { status: 402 });
    }

    const body = await req.json();
    const { inputImage, prompt, count } = body as {
      inputImage: { base64: string; mimeType: string };
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

    const promises = Array.from({ length: n }, () =>
      generateContentForBackground({ prompt, inputImage })
    );

    const results = await Promise.allSettled(promises);

    const images: { base64: string; mimeType: string }[] = [];
    const errors: string[] = [];

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.images.length > 0) {
        images.push(r.value.images[0]);
      } else if (r.status === "rejected") {
        errors.push(r.reason?.message || "알 수 없는 오류");
      } else {
        errors.push("모델이 이미지를 반환하지 않았습니다.");
      }
    }

    if (images.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "이미지 생성에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ images, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Background generation error:", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
