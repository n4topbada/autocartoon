import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlob, uploadBase64ImageWithThumbnail } from "@/lib/blob";

const MAX_PRESET_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function validatePresetImages(images: { base64: string; mimeType: string }[] | undefined) {
  if (!images || images.length === 0) {
    return "이미지가 필요합니다.";
  }

  for (const image of images) {
    if (!image.base64 || !image.mimeType) {
      return "이미지 데이터가 올바르지 않습니다.";
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) {
      return "PNG, JPG, WEBP, GIF 이미지만 업로드할 수 있습니다.";
    }
    if (Buffer.byteLength(image.base64, "base64") > MAX_IMAGE_BYTES) {
      return "이미지 용량이 너무 큽니다. 더 작은 이미지로 다시 시도해주세요.";
    }
  }

  return null;
}

function isBlobUnavailableError(error: unknown) {
  return error instanceof Error && /Vercel Blob|store has been suspended|Blob/i.test(error.message);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const preset = await prisma.characterPreset.findUnique({
      where: { id },
      include: { images: { orderBy: { order: "asc" } } },
    });
    if (!preset || preset.userId !== session.userId) {
      return NextResponse.json({ error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    const representativeImage =
      preset.images.find((img) => img.id === preset.representativeImageId) ??
      preset.images[0] ??
      null;

    return NextResponse.json({
      id: preset.id,
      representativeImage: representativeImage
        ? {
            id: representativeImage.id,
            dataUrl: representativeImage.blobUrl,
            thumbnailUrl: representativeImage.thumbnailUrl ?? representativeImage.blobUrl,
          }
        : null,
      images: preset.images.map((img) => ({
        id: img.id,
        dataUrl: img.blobUrl,
        thumbnailUrl: img.thumbnailUrl ?? img.blobUrl,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "이미지 조회 실패" }, { status: 500 });
  }
}

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

    const imageError = validatePresetImages(images);
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: 400 });
    }

    const currentCount = preset.images.length;
    if (currentCount + images.length > MAX_PRESET_IMAGES) {
      return NextResponse.json({ error: "캐릭터 이미지는 최대 4장까지 등록할 수 있습니다." }, { status: 400 });
    }

    const maxOrder = preset.images.reduce((m, img) => Math.max(m, img.order), -1);

    const uploads = await Promise.all(
      images.map((img) => uploadBase64ImageWithThumbnail(img.base64, img.mimeType, "presets"))
    );

    const created = [];
    for (let i = 0; i < images.length; i++) {
      const img = await prisma.presetImage.create({
        data: {
          presetId: id,
          blobUrl: uploads[i].blobUrl,
          thumbnailUrl: uploads[i].thumbnailUrl,
          mimeType: images[i].mimeType,
          order: maxOrder + 1 + i,
        },
      });
      created.push({ id: img.id, dataUrl: img.blobUrl, thumbnailUrl: img.thumbnailUrl ?? img.blobUrl });
    }

    return NextResponse.json({ images: created, total: currentCount + images.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image add error:", error);
    if (isBlobUnavailableError(error)) {
      return NextResponse.json(
        { error: "이미지 저장소를 사용할 수 없습니다. 관리자에게 문의해주세요." },
        { status: 503 }
      );
    }
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

    const target = preset.images.find((img) => img.id === imageId);
    await prisma.presetImage.delete({ where: { id: imageId } });
    if (target?.blobUrl) await deleteBlob(target.blobUrl);
    if (target?.thumbnailUrl) await deleteBlob(target.thumbnailUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "이미지 삭제 실패" }, { status: 500 });
  }
}
