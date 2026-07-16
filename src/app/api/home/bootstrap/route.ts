import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const requestedUserId = new URL(req.url).searchParams.get("userId");
    const targetUserId = session.role === "admin" && requestedUserId
      ? requestedUserId
      : session.userId;

    const [presets, requests, tags, promptPresets, backgrounds, users] = await Promise.all([
      prisma.characterPreset.findMany({
        where: {
          OR: [
            { userId: targetUserId },
            { purchasedBy: { some: { userId: targetUserId } } },
          ],
        },
        include: { images: { orderBy: { order: "asc" }, take: 4 } },
        orderBy: { order: "asc" },
      }),
      prisma.generationRequest.findMany({
        where: { userId: targetUserId },
        include: {
          preset: { select: { name: true, alias: true } },
          backgroundImage: { select: { name: true } },
          generatedImages: {
            select: {
              id: true,
              mimeType: true,
              blobUrl: true,
              thumbnailUrl: true,
              favorite: true,
              tagLinks: {
                include: {
                  tag: { select: { id: true, name: true, color: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.imageTag.findMany({
        where: { userId: session.userId },
        orderBy: { name: "asc" },
      }),
      prisma.promptPreset.findMany({
        where: { userId: session.userId },
        orderBy: { usedAt: "desc" },
        take: 30,
        select: { id: true, text: true, usedAt: true },
      }),
      prisma.savedBackground.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: "desc" },
      }),
      session.role === "admin"
        ? prisma.user.findMany({
            select: { id: true, email: true, name: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
    ]);

    const groupIds = Array.from(new Set(
      presets.flatMap((preset) => preset.groupId ? [preset.groupId] : [])
    ));
    const groups = await prisma.characterGroup.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          { id: { in: groupIds } },
        ],
      },
      orderBy: { order: "asc" },
    });

    const mapPreset = (preset: (typeof presets)[number]) => {
      const representativeImage =
        preset.images.find((image) => image.id === preset.representativeImageId) ??
        preset.images[0] ??
        null;
      return {
        id: preset.id,
        alias: preset.alias,
        name: preset.name,
        groupId: preset.groupId,
        order: preset.order,
        userId: preset.userId,
        description: preset.description,
        persona: preset.persona,
        voiceConfig: preset.voiceConfig,
        isDefault: preset.isDefault,
        representativeImage: representativeImage
          ? {
              id: representativeImage.id,
              dataUrl: representativeImage.blobUrl,
              thumbnailUrl: representativeImage.thumbnailUrl ?? representativeImage.blobUrl,
              view: representativeImage.view,
            }
          : null,
        images: preset.images.map((image) => ({
          id: image.id,
          view: image.view,
          dataUrl: image.blobUrl,
          thumbnailUrl: image.thumbnailUrl ?? image.blobUrl,
        })),
      };
    };

    const mappedByGroup = new Map<string, ReturnType<typeof mapPreset>[]>();
    for (const preset of presets) {
      if (!preset.groupId) continue;
      const values = mappedByGroup.get(preset.groupId) ?? [];
      values.push(mapPreset(preset));
      mappedByGroup.set(preset.groupId, values);
    }

    const history = requests
      .filter((request) => request.generatedImages.length > 0)
      .map((request) => ({
        id: request.id,
        mode: request.mode,
        prompt: request.prompt,
        background: request.background,
        backgroundImageName: request.backgroundImage?.name || null,
        presetName: request.preset?.name || "오리지널 캐릭터",
        createdAt: request.createdAt.toISOString(),
        images: request.generatedImages.map((image) => ({
          id: image.id,
          mimeType: image.mimeType,
          dataUrl: image.blobUrl,
          thumbnailUrl: image.thumbnailUrl ?? image.blobUrl,
          favorite: image.favorite,
          tags: image.tagLinks.map(({ tag }) => tag),
        })),
      }));

    return NextResponse.json({
      presets: {
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          order: group.order,
          presets: mappedByGroup.get(group.id) ?? [],
        })),
        ungrouped: presets.filter((preset) => !preset.groupId).map(mapPreset),
      },
      history,
      tags: tags.map(({ id, name, color }) => ({ id, name, color })),
      promptPresets,
      backgrounds: backgrounds.map((background) => ({
        id: background.id,
        name: background.name,
        mimeType: background.mimeType,
        dataUrl: background.blobUrl,
        thumbnailUrl: background.thumbnailUrl ?? background.blobUrl,
        createdAt: background.createdAt.toISOString(),
      })),
      users,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Home bootstrap error:", error);
    return NextResponse.json({ error: "초기 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
