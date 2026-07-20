import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  createCreditLedgerWithAudit,
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "@/lib/credit-audit";
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
  note: string,
  audit: { referenceId: string; traceId: string; metadata: Record<string, unknown> }
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
    await createCreditLedgerWithAudit(tx, {
      userId,
      referenceKey: `${audit.referenceId}:charge`,
      referenceId: audit.referenceId,
      traceId: audit.traceId,
      action: "charge",
      source: "marketplace",
      units: price,
      balanceBefore: user.credits + price,
      balanceAfter: user.credits,
      note,
      metadata: audit.metadata,
    });
  }
  return user.credits;
}

export async function POST(req: NextRequest) {
  let auditContext: {
    userId: string;
    units: number;
    referenceId: string;
    traceId: string;
    metadata: Record<string, unknown>;
  } | null = null;
  try {
    const session = await requireAuth();
    const requestReferenceId = `marketplace:${session.userId}:${randomUUID()}`;
    const requestAuditContext = {
      userId: session.userId,
      units: 0,
      referenceId: requestReferenceId,
      traceId: createCreditTraceId(requestReferenceId),
      metadata: {} as Record<string, unknown>,
    };
    auditContext = requestAuditContext;
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
        requestAuditContext.units = price;
        requestAuditContext.metadata = { itemType: "character-group", itemId: group.id, itemName: group.name };
        await tx.purchasedPreset.createMany({
          data: missingIds.map((id) => ({ userId: session.userId, presetId: id })),
        });
        const remainingCredits = await debitCredits(
          tx,
          session.userId,
          price,
          `캐릭터 그룹 구매: ${group.name}`,
          requestAuditContext
        );
        return { remainingCredits, traceId: requestAuditContext.traceId };
      });
      return NextResponse.json({ ok: true, remainingCredits: result.remainingCredits, traceId: result.traceId });
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
      requestAuditContext.units = price;
      requestAuditContext.metadata = { itemType: "character", itemId: preset.id, itemName: preset.name };
      const remainingCredits = await debitCredits(
        tx,
        session.userId,
        price,
        `캐릭터 구매: ${preset.name}`,
        requestAuditContext
      );
      return { remainingCredits, traceId: requestAuditContext.traceId };
    });
    return NextResponse.json({ ok: true, remainingCredits: result.remainingCredits, traceId: result.traceId });
  } catch (error) {
    if (auditContext && auditContext.units > 0) {
      const safe = sanitizeCreditAuditError(error);
      const wallet = await prisma.user.findUnique({
        where: { id: auditContext.userId },
        select: { credits: true },
      }).catch(() => null);
      await recordCreditAuditSafely({
        userId: wallet ? auditContext.userId : null,
        traceId: auditContext.traceId,
        referenceId: auditContext.referenceId,
        operation: "charge",
        direction: "debit",
        status: "failure",
        source: "marketplace",
        units: auditContext.units,
        balanceBefore: wallet?.credits,
        balanceAfter: wallet?.credits,
        reasonCode: error instanceof PurchaseError && error.status === 402
          ? "INSUFFICIENT_CREDITS"
          : safe.reasonCode,
        summary: "마켓 구매 크레딧 차감 실패",
        errorMessage: error instanceof Error ? error.message : safe.message,
        metadata: auditContext.metadata,
      });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PurchaseError) {
      return NextResponse.json(
        { error: error.message, traceId: auditContext?.units ? auditContext.traceId : undefined },
        { status: error.status }
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "이미 보유한 캐릭터입니다." }, { status: 400 });
    }
    console.error("Purchase error:", error);
    return NextResponse.json(
      { error: "구매에 실패했습니다.", traceId: auditContext?.units ? auditContext.traceId : undefined },
      { status: 500 }
    );
  }
}
