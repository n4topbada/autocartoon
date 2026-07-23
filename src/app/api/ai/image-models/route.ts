import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { IMAGE_MODEL_IDS, IMAGE_MODEL_PRICING } from "@/lib/ai-pricing";
import { isImageModelConfigured } from "@/lib/image-generation";

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({
      models: IMAGE_MODEL_IDS.map((id) => ({
        id,
        configured: IMAGE_MODEL_PRICING[id].availability === "available" && isImageModelConfigured(id),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "이미지 모델 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}
