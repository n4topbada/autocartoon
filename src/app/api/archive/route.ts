import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 24;
const KINDS = new Set(["all", "image", "character", "gesture", "background", "cutout", "video"]);

interface ArchiveRow {
  source: "artifact" | "image";
  id: string;
  kind: string;
  mediaType: "image" | "video";
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  prompt: string;
  projectId: string | null;
  cutId: string | null;
  createdAt: Date;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const page = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("page") || 1) || 1));
    const requestedKind = req.nextUrl.searchParams.get("kind") || "all";
    const kind = KINDS.has(requestedKind) ? requestedKind : "all";
    const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    const offset = (page - 1) * PAGE_SIZE;

    const artifactWhere: Prisma.GenerationArtifactWhereInput = {
      job: {
        userId: session.userId,
        ...(kind !== "all" ? { kind } : {}),
        ...(query ? { prompt: { contains: query, mode: "insensitive" } } : {}),
      },
    };
    const includeLegacy = kind === "all" || kind === "image" || kind === "cutout";
    const legacyWhere: Prisma.GeneratedImageWhereInput = {
      request: {
        userId: session.userId,
        jobId: null,
        ...(kind === "cutout"
          ? { mode: "cutout" }
          : kind === "image" ? { mode: { not: "cutout" } } : {}),
        ...(query ? { prompt: { contains: query, mode: "insensitive" } } : {}),
      },
    };

    const artifactKindSql = kind === "all"
      ? Prisma.empty
      : Prisma.sql`AND job."kind" = ${kind}`;
    const artifactSearchSql = query
      ? Prisma.sql`AND job."prompt" ILIKE ${`%${query}%`}`
      : Prisma.empty;
    const artifactSql = Prisma.sql`
      SELECT
        'artifact'::text AS "source",
        artifact."id",
        job."kind",
        CASE WHEN artifact."mimeType" LIKE 'video/%' THEN 'video' ELSE 'image' END AS "mediaType",
        artifact."blobUrl" AS "url",
        artifact."thumbnailUrl",
        artifact."mimeType",
        job."prompt",
        job."projectId",
        job."cutId",
        artifact."createdAt"
      FROM "GenerationArtifact" AS artifact
      INNER JOIN "GenerationJob" AS job ON job."id" = artifact."jobId"
      WHERE job."userId" = ${session.userId}
      ${artifactKindSql}
      ${artifactSearchSql}
    `;
    const legacyKindSql = kind === "cutout"
      ? Prisma.sql`AND request."mode" = 'cutout'`
      : kind === "image"
        ? Prisma.sql`AND request."mode" <> 'cutout'`
        : Prisma.empty;
    const legacySearchSql = query
      ? Prisma.sql`AND request."prompt" ILIKE ${`%${query}%`}`
      : Prisma.empty;
    const legacySql = Prisma.sql`
      SELECT
        'image'::text AS "source",
        image."id",
        CASE WHEN request."mode" = 'cutout' THEN 'cutout' ELSE 'image' END AS "kind",
        'image'::text AS "mediaType",
        image."blobUrl" AS "url",
        image."thumbnailUrl",
        image."mimeType",
        request."prompt",
        NULL::text AS "projectId",
        NULL::text AS "cutId",
        image."createdAt"
      FROM "GeneratedImage" AS image
      INNER JOIN "GenerationRequest" AS request ON request."id" = image."requestId"
      WHERE request."userId" = ${session.userId}
        AND request."jobId" IS NULL
      ${legacyKindSql}
      ${legacySearchSql}
    `;
    const combinedSql = includeLegacy
      ? Prisma.sql`${artifactSql} UNION ALL ${legacySql}`
      : artifactSql;

    const [items, artifactTotal, legacyTotal, artifactSize, legacySize] = await Promise.all([
      prisma.$queryRaw<ArchiveRow[]>(Prisma.sql`
        SELECT * FROM (${combinedSql}) AS archive_items
        ORDER BY "createdAt" DESC
        LIMIT ${PAGE_SIZE}
        OFFSET ${offset}
      `),
      prisma.generationArtifact.count({ where: artifactWhere }),
      includeLegacy ? prisma.generatedImage.count({ where: legacyWhere }) : Promise.resolve(0),
      prisma.generationArtifact.aggregate({
        where: { job: { userId: session.userId } },
        _sum: { sizeBytes: true },
      }),
      prisma.generatedImage.aggregate({
        // 작업 기반 이미지는 GenerationArtifact로도 집계되므로, 레거시(jobId 없음)만 합산해
        // 이중 계산을 막는다(list 쿼리의 legacyWhere/legacySql과 동일 기준).
        where: { request: { userId: session.userId, jobId: null } },
        _sum: { sizeBytes: true },
      }),
    ]);

    const total = artifactTotal + legacyTotal;
    const storageBytes = (artifactSize._sum.sizeBytes ?? 0) + (legacySize._sum.sizeBytes ?? 0);
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        key: `${item.source}:${item.id}`,
        thumbnailUrl: item.thumbnailUrl ?? item.url,
        createdAt: item.createdAt.toISOString(),
      })),
      storageBytes,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Archive list error:", error);
    return NextResponse.json({ error: "작업 보관함을 불러오지 못했습니다." }, { status: 500 });
  }
}
