import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { uploadBase64ToBlob } from "@/lib/blob";

const MAX_PRESET_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function validatePresetImages(images: { base64: string; mimeType: string }[] | undefined) {
  if (!images || images.length === 0) {
    return "최소 1장의 이미지가 필요합니다.";
  }
  if (images.length > MAX_PRESET_IMAGES) {
    return "최대 4장까지 업로드할 수 있습니다.";
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

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    let targetUserId = session.userId;
    if (session.role === "admin" && searchParams.get("userId")) {
      targetUserId = searchParams.get("userId")!;
    }

    // 유저 소유 프리셋 + 구매한 시스템 프리셋
    const purchasedIds = (
      await prisma.purchasedPreset.findMany({
        where: { userId: targetUserId },
        select: { presetId: true },
      })
    ).map((p) => p.presetId);

    const presets = await prisma.characterPreset.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          { id: { in: purchasedIds } },
        ],
      },
      include: {
        images: { orderBy: { order: "asc" }, take: 4 },
      },
      orderBy: { order: "asc" },
    });

    const mapPreset = (p: (typeof presets)[0]) => {
      const repImage =
        p.images.find((img) => img.id === p.representativeImageId) ??
        p.images[0] ??
        null;
      return {
        id: p.id,
        alias: p.alias,
        name: p.name,
        groupId: p.groupId,
        order: p.order,
        userId: p.userId,
        representativeImage: repImage
          ? { id: repImage.id, dataUrl: repImage.blobUrl }
          : null,
        images: repImage ? [{ id: repImage.id, dataUrl: repImage.blobUrl }] : [],
      };
    };

    // 그룹 조회: 유저 소유 + 구매한 프리셋이 속한 시스템 그룹
    const purchasedGroupIds = presets
      .filter((p) => p.groupId)
      .map((p) => p.groupId!)
      .filter((v, i, a) => a.indexOf(v) === i);

    const groups = await prisma.characterGroup.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          { id: { in: purchasedGroupIds } },
        ],
      },
      orderBy: { order: "asc" },
    });

    const presetsByGroupId = new Map<string, typeof presets>();
    for (const preset of presets) {
      if (!preset.groupId) continue;
      const groupPresets = presetsByGroupId.get(preset.groupId) ?? [];
      groupPresets.push(preset);
      presetsByGroupId.set(preset.groupId, groupPresets);
    }

    const grouped = groups.map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      presets: (presetsByGroupId.get(g.id) ?? []).map(mapPreset),
    }));

    const ungrouped = presets.filter((p) => !p.groupId).map(mapPreset);

    return NextResponse.json({ groups: grouped, ungrouped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프리셋 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { name, images, groupId, isPublic } = body as {
      name: string;
      images: { base64: string; mimeType: string }[];
      groupId?: string;
      isPublic?: boolean;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "캐릭터 이름을 입력해주세요." }, { status: 400 });
    }

    const imageError = validatePresetImages(images);
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: 400 });
    }

    if (groupId) {
      const group = await prisma.characterGroup.findUnique({
        where: { id: groupId },
        select: { userId: true },
      });
      if (!group || group.userId !== session.userId) {
        return NextResponse.json({ error: "캐릭터 그룹을 찾을 수 없습니다." }, { status: 404 });
      }
    }

    // Blob에 업로드
    const blobUrls = await Promise.all(
      images.map((img) => uploadBase64ToBlob(img.base64, img.mimeType, "presets"))
    );

    const alias = `${name.trim()}_${Date.now()}`;

    const preset = await prisma.characterPreset.create({
      data: {
        alias,
        name: name.trim(),
        userId: session.userId,
        groupId: groupId || null,
        isPublic: isPublic ?? false,
        images: {
          create: images.map((img, i) => ({
            blobUrl: blobUrls[i],
            mimeType: img.mimeType,
            order: i,
          })),
        },
      },
      include: {
        images: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({
      id: preset.id,
      alias: preset.alias,
      name: preset.name,
      groupId: preset.groupId,
      order: preset.order,
      userId: preset.userId,
      representativeImage: preset.images[0]
        ? { id: preset.images[0].id, dataUrl: preset.images[0].blobUrl }
        : null,
      images: preset.images.map((img) => ({
        id: img.id,
        dataUrl: img.blobUrl,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Preset creation error:", error);
    if (isBlobUnavailableError(error)) {
      return NextResponse.json(
        { error: "이미지 저장소를 사용할 수 없습니다. 관리자에게 문의해주세요." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "캐릭터 등록에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
