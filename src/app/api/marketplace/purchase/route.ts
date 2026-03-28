import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { presetId, groupId } = (await req.json()) as {
      presetId?: string;
      groupId?: string;
    };

    if (!presetId && !groupId) {
      return NextResponse.json({ error: "presetId 또는 groupId가 필요합니다." }, { status: 400 });
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });

    // 그룹 구매: 그룹 내 모든 프리셋을 한번에 구매
    if (groupId) {
      const group = await prisma.characterGroup.findUnique({
        where: { id: groupId },
        include: { presets: true },
      });

      if (!group || group.userId !== null) {
        // userId가 null인 시스템 그룹만 구매 가능
        // 하지만 실제로 userId=null인 그룹이므로 조건 수정
      }
      if (!group) {
        return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
      }

      // 이미 모든 프리셋 구매했는지 확인
      const existingPurchases = await prisma.purchasedPreset.findMany({
        where: {
          userId: session.userId,
          presetId: { in: group.presets.map((p) => p.id) },
        },
      });
      const alreadyPurchasedIds = new Set(existingPurchases.map((p) => p.presetId));

      if (group.presets.every((p) => alreadyPurchasedIds.has(p.id))) {
        return NextResponse.json({ error: "이미 보유한 캐릭터셋입니다." }, { status: 400 });
      }

      // 가격 = 그룹 내 최대 가격
      const price = Math.max(0, ...group.presets.map((p) => p.price));

      if (price > 0 && user.credits < price) {
        return NextResponse.json(
          { error: `바나나가 부족합니다. (필요: ${price}, 보유: ${user.credits})` },
          { status: 400 }
        );
      }

      // 트랜잭션: 크레딧 차감 + 미구매 프리셋 모두 구매
      const newPurchases = group.presets
        .filter((p) => !alreadyPurchasedIds.has(p.id))
        .map((p) =>
          prisma.purchasedPreset.create({
            data: { userId: session.userId, presetId: p.id },
          })
        );

      await prisma.$transaction([
        ...(price > 0
          ? [prisma.user.update({ where: { id: session.userId }, data: { credits: { decrement: price } } })]
          : []),
        ...newPurchases,
      ]);

      return NextResponse.json({ ok: true, remainingCredits: user.credits - price });
    }

    // 개별 프리셋 구매 (독립 캐릭터)
    const preset = await prisma.characterPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset) {
      return NextResponse.json({ error: "마켓플레이스 프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    const existing = await prisma.purchasedPreset.findUnique({
      where: { userId_presetId: { userId: session.userId, presetId: presetId! } },
    });

    if (existing) {
      return NextResponse.json({ error: "이미 보유한 캐릭터입니다." }, { status: 400 });
    }

    if (preset.price > 0 && user.credits < preset.price) {
      return NextResponse.json(
        { error: `바나나가 부족합니다. (필요: ${preset.price}, 보유: ${user.credits})` },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      ...(preset.price > 0
        ? [prisma.user.update({ where: { id: session.userId }, data: { credits: { decrement: preset.price } } })]
        : []),
      prisma.purchasedPreset.create({
        data: { userId: session.userId, presetId: presetId! },
      }),
    ]);

    return NextResponse.json({ ok: true, remainingCredits: user.credits - preset.price });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Purchase error:", error);
    return NextResponse.json({ error: "구매 실패" }, { status: 500 });
  }
}
