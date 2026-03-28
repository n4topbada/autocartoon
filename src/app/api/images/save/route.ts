import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { uploadBase64ToBlob } from "@/lib/blob";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { base64, mimeType } = (await req.json()) as {
      base64: string;
      mimeType: string;
    };

    if (!base64) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }

    // Blob에 업로드
    const blobUrl = await uploadBase64ToBlob(base64, mimeType || "image/png", "edited");

    // 유저의 첫 번째 프리셋 찾기 (GenerationRequest에 presetId 필수)
    const firstPreset = await prisma.characterPreset.findFirst({
      where: {
        OR: [
          { userId: session.userId },
          { purchasedBy: { some: { userId: session.userId } } },
        ],
      },
    });

    if (!firstPreset) {
      return NextResponse.json({ error: "캐릭터가 없습니다." }, { status: 400 });
    }

    // GenerationRequest + GeneratedImage 생성
    const genRequest = await prisma.generationRequest.create({
      data: {
        presetId: firstPreset.id,
        presetIds: [firstPreset.id],
        userId: session.userId,
        mode: "edit",
        prompt: "캔버스 편집",
      },
    });

    const image = await prisma.generatedImage.create({
      data: {
        requestId: genRequest.id,
        blobUrl,
        mimeType: mimeType || "image/png",
      },
    });

    return NextResponse.json({
      id: image.id,
      dataUrl: blobUrl,
      mimeType: image.mimeType,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image save error:", error);
    return NextResponse.json({ error: "이미지 저장 실패" }, { status: 500 });
  }
}
