import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updateData: Prisma.UserUpdateInput = {};

    let addCredits = 0;
    if (body.addCredits !== undefined) {
      addCredits = Number(body.addCredits);
      if (!Number.isSafeInteger(addCredits) || addCredits <= 0 || addCredits > 1_000_000) {
        return NextResponse.json({ error: "크레딧은 1에서 1,000,000 사이의 정수여야 합니다." }, { status: 400 });
      }
      updateData.credits = { increment: addCredits };
    }

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length > 80) {
        return NextResponse.json({ error: "이름은 80자 이하로 입력해주세요." }, { status: 400 });
      }
      updateData.name = body.name.trim() || null;
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, email: true, name: true, credits: true },
      });
      if (addCredits > 0) {
        await tx.creditLedger.create({
          data: {
            userId: id,
            referenceKey: `admin:${admin.userId}:${randomUUID()}:grant`,
            action: "grant",
            source: "admin",
            units: addCredits,
            balanceAfter: updated.credits,
            note: "관리자 수동 지급",
          },
        });
      }
      return updated;
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "사용자 정보를 업데이트하지 못했습니다." }, { status: 500 });
  }
}
