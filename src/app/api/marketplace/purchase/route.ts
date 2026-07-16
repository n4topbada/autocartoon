import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class PurchaseError extends Error {
  constructor(message: string, readonly status: number) {
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
  price: number,
  note: string
) {
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
      if (!user) throw new PurchaseError("사용자를 찾을 수 없습니다.", 401);
      throw new PurchaseError(
        `크레딧이 부족합니다. (필요: ${price}, 보유: ${user.credits})`,
        402
      );
    }
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  if (!user) throw new PurchaseError("사용자를 찾을 수 없습니다.", 401);

  if (price > 0) {
    await tx.creditLedger.create({
      data: {
        userId,
        referenceKey: `marketplace:${randomUUID()}:charge`,
        action: "charge",
        source: "marketplace",
        units: price,
        balanceAfter: user.credits,
        note,
      },
    });
  }
  return user.credits;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const presetId = typeof body.presetId === "string" && body.presetId.trim()
      ? body.presetId.trim()
      : undefined;
    const groupId = typeof body.groupId === "string" && body.groupId.trim()
      ? body.groupId.trim()
      : undefined;
    if ((!presetId && !groupId) || (presetId && groupId)) {
      return NextResponse.json({ error: "presetId 또는 groupId 중 하나가 필요합니다." }, { status: 400 });
    }

    const entitlementWhere = purchasablePresetWhere(session.userId);
    if (groupId) {
      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.characterGroup.findFirst({
          where: {
            id: groupId,
            OR: [{ userId: null }, { userId: { not: session.userId } }],
            presets: { some: entitlementWhere },
          },
          include: { presets: { where: entitlementWhere, orderBy: { order: "asc" } } },
        });
        if (!group || group.presets.length === 0) {
          throw new PurchaseError("캐릭터 그룹을 찾을 수 없습니다.", 404);
        }

        const presetIds = group.presets.map((preset) => preset.id);
        const existing = await tx.purchasedPreset.findMany({
          where: { userId: session.userId, presetId: { in: presetIds } },
          select: { presetId: true },
        });
        const ownedIds = new Set(existing.map((item) => item.presetId));
        const missingIds = presetIds.filter((id) => !ownedIds.has(id));
        if (missingIds.length === 0) {
          throw new PurchaseError("이미 보유한 캐릭터 세트입니다.", 400);
        }

        const price = Math.max(0, ...group.presets.map((preset) => preset.price));
        await tx.purchasedPreset.createMany({
          data: missingIds.map((id) => ({ userId: session.userId, presetId: id })),
        });
        const remainingCredits = await debitCredits(
          tx,
          session.userId,
          price,
          `캐릭터 그룹 구매: ${group.name}`
        );
        return { remainingCredits };
      });
      return NextResponse.json({ ok: true, remainingCredits: result.remainingCredits });
    }

    const result = await prisma.$transaction(async (tx) => {
      const preset = await tx.characterPreset.findFirst({
        where: { id: presetId!, groupId: null, AND: [entitlementWhere] },
      });
      if (!preset) throw new PurchaseError("마켓플레이스 캐릭터를 찾을 수 없습니다.", 404);

      const existing = await tx.purchasedPreset.findUnique({
        where: { userId_presetId: { userId: session.userId, presetId: preset.id } },
      });
      if (existing) throw new PurchaseError("이미 보유한 캐릭터입니다.", 400);

      await tx.purchasedPreset.create({
        data: { userId: session.userId, presetId: preset.id },
      });
      const price = Math.max(0, preset.price);
      const remainingCredits = await debitCredits(
        tx,
        session.userId,
        price,
        `캐릭터 구매: ${preset.name}`
      );
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
    return NextResponse.json({ error: "구매에 실패했습니다." }, { status: 500 });
  }
}
