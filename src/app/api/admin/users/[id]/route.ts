import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  parseAdminCreditGrant,
  type AdminCreditGrant,
} from "@/lib/admin-credit-grant";
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

    let creditGrant: AdminCreditGrant | null = null;
    if (body.addCredits !== undefined || body.creditProductCode !== undefined) {
      const parsedGrant = parseAdminCreditGrant(body);
      if (!parsedGrant.ok) {
        return NextResponse.json({ error: parsedGrant.error }, { status: 400 });
      }
      creditGrant = parsedGrant.grant;
      updateData.credits = { increment: creditGrant.amount };
    }

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length > 80) {
        return NextResponse.json({ error: "이름은 80자 이하로 입력해주세요." }, { status: 400 });
      }
      updateData.name = body.name.trim() || null;
    }

    if (!creditGrant && body.name === undefined) {
      return NextResponse.json({ error: "변경할 사용자 정보를 입력해주세요." }, { status: 400 });
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, email: true, name: true, credits: true },
      });
      if (creditGrant) {
        await tx.creditLedger.create({
          data: {
            userId: id,
            referenceKey: `admin:${admin.userId}:${randomUUID()}:grant`,
            action: "grant",
            source: "admin",
            units: creditGrant.amount,
            balanceAfter: updated.credits,
            note: creditGrant.note,
          },
        });
      }
      return {
        ...updated,
        previousCredits: creditGrant ? updated.credits - creditGrant.amount : updated.credits,
        grantedCredits: creditGrant?.amount ?? 0,
        grantMode: creditGrant?.mode ?? null,
        creditProductCode: creditGrant?.productCode ?? null,
      };
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "사용자 정보를 업데이트하지 못했습니다." }, { status: 500 });
  }
}
