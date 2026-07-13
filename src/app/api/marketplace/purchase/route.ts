import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

class PurchaseError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function purchasablePresetWhere(userId: string): Prisma.CharacterPresetWhereInput {
  return {
    OR: [
      { userId: null },
      { userId: { not: userId }, isPublic: true },
    ],
  };
}

async function debitCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  price: number
): Promise<number> {
  if (price > 0) {
    const charged = await tx.user.updateMany({
      where: { id: userId, credits: { gte: price } },
      data: { credits: { decrement: price } },
    });
    if (charged.count === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      if (!user) {
        throw new PurchaseError("사용자를 찾을 수 없습니다.", 401);
      }
      throw new PurchaseError(
        `바나나가 부족합니다. (필요: ${price}, 보유: ${user.credits})`,
        400
      );
    }
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  if (!user) {
    throw new PurchaseError("사용자를 찾을 수 없습니다.", 401);
  }
  return user.credits;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json()) as Record<string, unknown>;
    const presetId = typeof body.presetId === "string" && body.presetId.trim()
      ? body.presetId.trim()
      : undefined;
    const groupId = typeof body.groupId === "string" && body.groupId.trim()
      ? body.groupId.trim()
      : undefined;

    if ((!presetId && !groupId) || (presetId && groupId)) {
      return NextResponse.json(
        { error: "presetId 또는 groupId 중 하나만 필요합니다." },
        { status: 400 }
      );
    }

    const entitlementWhere = purchasablePresetWhere(session.userId);

    // 그룹 구매: 그룹 내 모든 프리셋을 한번에 구매
    if (groupId) {
      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.characterGroup.findFirst({
          where: {
            id: groupId,
            OR: [{ userId: null }, { userId: { not: session.userId } }],
            presets: { some: entitlementWhere },
          },
          include: {
            presets: { where: entitlementWhere, orderBy: { order: "asc" } },
          },
        });
        if (!group || group.presets.length === 0) {
          throw new PurchaseError("그룹을 찾을 수 없습니다.", 404);
        }

        const presetIds = group.presets.map((preset) => preset.id);
        const existingPurchases = await tx.purchasedPreset.findMany({
          where: { userId: session.userId, presetId: { in: presetIds } },
          select: { presetId: true },
        });
        const alreadyPurchasedIds = new Set(existingPurchases.map((item) => item.presetId));
        const missingPresetIds = presetIds.filter((id) => !alreadyPurchasedIds.has(id));
        if (missingPresetIds.length === 0) {
          throw new PurchaseError("이미 보유한 캐릭터셋입니다.", 400);
        }

        const price = Math.max(0, ...group.presets.map((preset) => preset.price));
        await tx.purchasedPreset.createMany({
          data: missingPresetIds.map((id) => ({
            userId: session.userId,
            presetId: id,
          })),
        });
        const remainingCredits = await debitCredits(tx, session.userId, price);
        return { remainingCredits };
      });

      return NextResponse.json({ ok: true, remainingCredits: result.remainingCredits });
    }

    // 개별 프리셋 구매 (독립 캐릭터)
    const result = await prisma.$transaction(async (tx) => {
      const preset = await tx.characterPreset.findFirst({
        where: { id: presetId!, groupId: null, AND: [entitlementWhere] },
      });
      if (!preset) {
        throw new PurchaseError("마켓플레이스 프리셋을 찾을 수 없습니다.", 404);
      }

      const existing = await tx.purchasedPreset.findUnique({
        where: { userId_presetId: { userId: session.userId, presetId: preset.id } },
      });
      if (existing) {
        throw new PurchaseError("이미 보유한 캐릭터입니다.", 400);
      }

      await tx.purchasedPreset.create({
        data: { userId: session.userId, presetId: preset.id },
      });
      const price = Math.max(0, preset.price);
      const remainingCredits = await debitCredits(tx, session.userId, price);
      return { remainingCredits };
    });

    return NextResponse.json({ ok: true, remainingCredits: result.remainingCredits });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PurchaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "이미 보유한 캐릭터입니다." }, { status: 400 });
    }
    console.error("Purchase error:", error);
    return NextResponse.json({ error: "구매 실패" }, { status: 500 });
  }
}
