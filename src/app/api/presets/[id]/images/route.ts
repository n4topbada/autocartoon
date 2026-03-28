import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { uploadBase64ToBlob } from "@/lib/blob";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const preset = await prisma.characterPreset.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!preset || preset.userId !== session.userId) {
      return NextResponse.json({ error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    const { images } = (await req.json()) as {
      images: { base64: string; mimeType: string }[];
    };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }

    const currentCount = preset.images.length;
    const maxOrder = preset.images.reduce((m, img) => Math.max(m, img.order), -1);

    const blobUrls = await Promise.all(
      images.map((img) => uploadBase64ToBlob(img.base64, img.mimeType, "presets"))
    );

    const created = [];
    for (let i = 0; i < images.length; i++) {
      const img = await prisma.presetImage.create({
        data: {
          presetId: id,
          blobUrl: blobUrls[i],
          mimeType: images[i].mimeType,
          order: maxOrder + 1 + i,
        },
      });
      created.push({ id: img.id, dataUrl: img.blobUrl });
    }

    return NextResponse.json({ images: created, total: currentCount + images.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image add error:", error);
    return NextResponse.json({ error: "이미지 추가 실패" }, { status: 500 });
  }
}

export async function DELETE(
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
    if (preset.images.length <= 1) {
      return NextResponse.json({ error: "최소 1개의 이미지는 유지해야 합니다." }, { status: 400 });
    }

    await prisma.presetImage.delete({ where: { id: imageId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "이미지 삭제 실패" }, { status: 500 });
  }
}
