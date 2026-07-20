import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  parseAdminCreditGrant,
  type AdminCreditGrant,
} from "@/lib/admin-credit-grant";
import { AuthError, requireAdmin } from "@/lib/auth";
import {
  createCreditLedgerWithAudit,
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "@/lib/credit-audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let actorUserId: string | null = null;
  let auditContext: {
    userId: string;
    units: number;
    traceId: string;
    referenceId: string;
    metadata: Record<string, unknown>;
  } | null = null;
  try {
    const admin = await requireAdmin();
    actorUserId = admin.userId;
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
      const referenceId = `admin:${admin.userId}:${randomUUID()}`;
      auditContext = {
        userId: id,
        units: creditGrant.amount,
        referenceId,
        traceId: createCreditTraceId(referenceId),
        metadata: {
          grantMode: creditGrant.mode,
          adminProductCode: creditGrant.productCode,
        },
      };
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
        const context = auditContext!;
        await createCreditLedgerWithAudit(tx, {
          userId: id,
          actorUserId: admin.userId,
          referenceKey: `${context.referenceId}:grant`,
          referenceId: context.referenceId,
          traceId: context.traceId,
          action: "grant",
          source: "admin",
          units: creditGrant.amount,
          balanceBefore: updated.credits - creditGrant.amount,
          balanceAfter: updated.credits,
          note: creditGrant.note,
          reasonCode: "ADMIN_GRANT_COMMITTED",
          metadata: context.metadata,
        });
      }
      return {
        ...updated,
        previousCredits: creditGrant ? updated.credits - creditGrant.amount : updated.credits,
        grantedCredits: creditGrant?.amount ?? 0,
        grantMode: creditGrant?.mode ?? null,
        creditProductCode: creditGrant?.productCode ?? null,
        traceId: auditContext?.traceId ?? null,
      };
    });

    return NextResponse.json(user);
  } catch (error) {
    if (auditContext && actorUserId) {
      const safe = sanitizeCreditAuditError(error);
      const wallet = await prisma.user.findUnique({
        where: { id: auditContext.userId },
        select: { credits: true },
      }).catch(() => null);
      await recordCreditAuditSafely({
        userId: wallet ? auditContext.userId : null,
        actorUserId,
        traceId: auditContext.traceId,
        referenceId: auditContext.referenceId,
        operation: "grant",
        direction: "credit",
        status: "failure",
        source: "admin",
        units: auditContext.units,
        balanceBefore: wallet?.credits,
        balanceAfter: wallet?.credits,
        reasonCode: safe.reasonCode,
        summary: "관리자 크레딧 지급 실패",
        errorMessage: safe.message,
        metadata: auditContext.metadata,
      });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다.", traceId: auditContext?.traceId },
        { status: 404 }
      );
    }
    console.error("Admin user update error:", error);
    return NextResponse.json(
      { error: "사용자 정보를 업데이트하지 못했습니다.", traceId: auditContext?.traceId },
      { status: 500 }
    );
  }
}
