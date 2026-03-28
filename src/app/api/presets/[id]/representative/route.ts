import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { imageId } = (await req.json()) as { imageId: string };

    const preset = await prisma.characterPreset.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!preset || preset.userId !== session.userId) {
      return NextResponse.json({ error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetImage = preset.images.find((img) => img.id === imageId);
    if (!targetImage) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.characterPreset.update({
      where: { id },
      data: { representativeImageId: imageId },
    });

    return NextResponse.json({
      representativeImage: { id: targetImage.id, dataUrl: targetImage.blobUrl },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "대표이미지 설정 실패" }, { status: 500 });
  }
}
