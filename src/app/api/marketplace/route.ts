import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();

    // 1. 마켓플레이스 그룹 (Depth_A with children) - 본인 소유가 아닌 모든 그룹
    const groups = await prisma.characterGroup.findMany({
      where: { NOT: { userId: session.userId }, presets: { some: { isPublic: true } } },
      include: {
        presets: {
          include: {
            images: { orderBy: { order: "asc" }, take: 1 },
            purchasedBy: {
              where: { userId: session.userId },
              select: { id: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    // 2. 독립 프리셋 (groupId=null, 본인 소유 아닌 것)
    const standalone = await prisma.characterPreset.findMany({
      where: { groupId: null, isPublic: true, NOT: { userId: session.userId } },
      include: {
        images: { orderBy: { order: "asc" }, take: 1 },
        purchasedBy: {
          where: { userId: session.userId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 마켓플레이스 아이템: Depth_A 기준
    const items = [
      // 독립 캐릭터 → type: "preset"
      ...standalone.map((p) => {
        const repImage = p.images.find((img) => img.id === p.representativeImageId) ?? p.images[0];
        return {
          type: "preset" as const,
          id: p.id,
          name: p.name,
          price: p.price,
          owned: p.purchasedBy.length > 0,
          characterCount: 1,
          thumbnail: repImage ? repImage.blobUrl : null,
        };
      }),
      // 그룹 → type: "group"
      ...groups.map((g) => {
        // 그룹의 첫 번째 캐릭터 대표이미지를 썸네일로
        const firstPreset = g.presets[0];
        const repImage = firstPreset
          ? (firstPreset.images.find((img) => img.id === firstPreset.representativeImageId) ?? firstPreset.images[0])
          : null;
        // 그룹 가격 = 그룹 내 프리셋 중 최대 가격 (보통 0)
        const price = Math.max(0, ...g.presets.map((p) => p.price));
        // 모든 프리셋을 보유하면 owned
        const owned = g.presets.length > 0 && g.presets.every((p) => p.purchasedBy.length > 0);
        return {
          type: "group" as const,
          id: g.id,
          name: g.name,
          price,
          owned,
          characterCount: g.presets.length,
          thumbnail: repImage ? repImage.blobUrl : null,
        };
      }),
    ];

    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "마켓플레이스 조회 실패" }, { status: 500 });
  }
}
