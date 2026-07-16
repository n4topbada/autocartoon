import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  deleteBlob,
  fetchBlobAsBase64,
  uploadBase64ImageWithThumbnail,
} from "@/lib/blob";
import { prisma } from "@/lib/prisma";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2_000;

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  let uploaded: { blobUrl: string; thumbnailUrl: string } | null = null;

  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const name = readText(body?.name, MAX_NAME_LENGTH);
    const imageId = readText(body?.imageId, 128);
    const description = readText(body?.description, MAX_DESCRIPTION_LENGTH);

    if (!name || !imageId) {
      return NextResponse.json(
        { error: "캐릭터 이름과 생성 이미지를 확인해주세요." },
        { status: 400 }
      );
    }

    const image = await prisma.generatedImage.findFirst({
      where: {
        id: imageId,
        request: { userId: session.userId },
      },
      select: { blobUrl: true, mimeType: true },
    });
    if (!image) {
      return NextResponse.json(
        { error: "생성 이미지를 찾을 수 없거나 저장할 권한이 없습니다." },
        { status: 404 }
      );
    }

    const source = await fetchBlobAsBase64(image.blobUrl);
    uploaded = await uploadBase64ImageWithThumbnail(
      source.base64,
      image.mimeType || source.mimeType,
      "presets"
    );

    const preset = await prisma.$transaction(async (tx) => {
      const created = await tx.characterPreset.create({
        data: {
          alias: `${name}_${crypto.randomUUID()}`,
          name,
          description: description || null,
          userId: session.userId,
          images: {
            create: {
              blobUrl: uploaded!.blobUrl,
              thumbnailUrl: uploaded!.thumbnailUrl,
              mimeType: image.mimeType || source.mimeType,
              view: "front",
              order: 0,
            },
          },
        },
        include: { images: true },
      });
      const representativeImageId = created.images[0].id;
      return tx.characterPreset.update({
        where: { id: created.id },
        data: { representativeImageId },
        include: { images: { orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json({
      preset: {
        id: preset.id,
        alias: preset.alias,
        name: preset.name,
        groupId: preset.groupId,
        order: preset.order,
        userId: preset.userId,
        description: preset.description,
        representativeImage: {
          id: preset.images[0].id,
          dataUrl: preset.images[0].blobUrl,
          thumbnailUrl: preset.images[0].thumbnailUrl ?? preset.images[0].blobUrl,
        },
        images: preset.images.map((item) => ({
          id: item.id,
          view: item.view,
          dataUrl: item.blobUrl,
          thumbnailUrl: item.thumbnailUrl ?? item.blobUrl,
        })),
      },
    });
  } catch (error) {
    if (uploaded) {
      await Promise.all([
        deleteBlob(uploaded.blobUrl),
        deleteBlob(uploaded.thumbnailUrl),
      ]);
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Generated character save error:", error);
    return NextResponse.json(
      { error: "생성한 캐릭터를 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
