import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import {
  CREDIT_AUDIT_METADATA_LABELS,
  formatCreditAuditMetadataValue,
  getCreditAuditDirectionLabel,
  getCreditAuditOperationLabel,
  getCreditAuditSourceLabel,
  getCreditAuditStatusLabel,
  normalizeCreditAuditSearch,
} from "@/lib/credit-audit-view";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

function parsePage(value: string | null) {
  const parsed = Number(value || "1");
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 250) : 1;
}

function accountKey(user: { email: string; kakaoId: string | null } | null) {
  return user?.kakaoId ? `kakao-${user.kakaoId}` : user?.email || "삭제되거나 찾을 수 없는 계정";
}

function metadataDetails(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== "-")
    .slice(0, 24)
    .map(([key, value]) => ({
      key,
      label: CREDIT_AUDIT_METADATA_LABELS[key] || key.replaceAll("_", " "),
      value: formatCreditAuditMetadataValue(key, value),
    }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const params = req.nextUrl.searchParams;
    const search = normalizeCreditAuditSearch(params.get("q") || "");
    const status = params.get("status") || "all";
    const direction = params.get("direction") || "all";
    const source = normalizeCreditAuditSearch(params.get("source") || "all");
    const operation = normalizeCreditAuditSearch(params.get("operation") || "all");
    const integrity = params.get("integrity") || "all";
    const range = params.get("range") || "7d";
    const page = parsePage(params.get("page"));
    const where: Prisma.CreditAuditEventWhereInput = {};

    if (status === "success" || status === "failure") where.status = status;
    if (direction === "credit" || direction === "debit" || direction === "neutral") {
      where.direction = direction;
    }
    if (source && source !== "all") where.source = source;
    if (operation && operation !== "all") where.operation = operation;
    if (integrity === "failed") where.balanceVerified = false;
    if (RANGE_MS[range]) {
      where.createdAt = { gte: new Date(Date.now() - RANGE_MS[range]) };
    }

    if (search) {
      const kakaoId = search.toLowerCase().startsWith("kakao-") ? search.slice(6) : search;
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { traceId: { contains: search, mode: "insensitive" } },
        { referenceId: { contains: search, mode: "insensitive" } },
        { reasonCode: { contains: search, mode: "insensitive" } },
        { jobId: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        {
          user: {
            is: {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { kakaoId: { contains: kakaoId, mode: "insensitive" } },
              ],
            },
          },
        },
        {
          actor: {
            is: {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const [events, total, grouped, sources, operations] = await Promise.all([
      prisma.creditAuditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          user: { select: { id: true, email: true, name: true, kakaoId: true } },
          actor: { select: { id: true, email: true, name: true, kakaoId: true } },
        },
      }),
      prisma.creditAuditEvent.count({ where }),
      prisma.creditAuditEvent.groupBy({
        by: ["status", "direction", "operation"],
        where,
        _count: { _all: true },
        _sum: { units: true },
      }),
      prisma.creditAuditEvent.findMany({
        distinct: ["source"],
        orderBy: { source: "asc" },
        select: { source: true },
      }),
      prisma.creditAuditEvent.findMany({
        distinct: ["operation"],
        orderBy: { operation: "asc" },
        select: { operation: true },
      }),
    ]);

    const totals = grouped.reduce(
      (result, row) => {
        const count = row._count._all;
        const units = row._sum.units || 0;
        if (row.status === "failure") result.failed += count;
        else result.succeeded += count;
        if (row.status === "success" && row.direction === "credit") result.credited += units;
        if (row.status === "success" && row.direction === "debit") result.debited += units;
        if (row.status === "success" && row.operation === "refund") result.refunded += units;
        return result;
      },
      { succeeded: 0, failed: 0, credited: 0, debited: 0, refunded: 0 }
    );
    const integrityFailures = await prisma.creditAuditEvent.count({
      where: { ...where, balanceVerified: false },
    });

    return NextResponse.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      hasMore: page * PAGE_SIZE < total,
      summary: { ...totals, integrityFailures },
      filters: {
        sources: sources.map(({ source: value }) => ({ value, label: getCreditAuditSourceLabel(value) })),
        operations: operations.map(({ operation: value }) => ({ value, label: getCreditAuditOperationLabel(value) })),
      },
      events: events.map((event) => ({
        id: event.id,
        traceId: event.traceId,
        referenceId: event.referenceId,
        ledgerId: event.ledgerId,
        jobId: event.jobId,
        status: event.status,
        statusLabel: getCreditAuditStatusLabel(event.status),
        direction: event.direction,
        directionLabel: getCreditAuditDirectionLabel(event.direction),
        operation: event.operation,
        operationLabel: getCreditAuditOperationLabel(event.operation),
        source: event.source,
        sourceLabel: getCreditAuditSourceLabel(event.source),
        units: event.units,
        balanceBefore: event.balanceBefore,
        balanceAfter: event.balanceAfter,
        balanceVerified: event.balanceVerified,
        reasonCode: event.reasonCode,
        summary: event.summary,
        errorMessage: event.errorMessage,
        createdAt: event.createdAt.toISOString(),
        user: event.user
          ? { id: event.user.id, name: event.user.name, accountKey: accountKey(event.user), email: event.user.email }
          : null,
        actor: event.actor
          ? { id: event.actor.id, name: event.actor.name, accountKey: accountKey(event.actor), email: event.actor.email }
          : null,
        details: metadataDetails(event.metadata),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin credit audit error:", error);
    return NextResponse.json({ error: "크레딧 감사 기록을 불러오지 못했습니다." }, { status: 500 });
  }
}
