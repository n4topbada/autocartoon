import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  applyCaptionStyleToCanvas,
  applyWatermarkToCanvas,
  createCanvasPresetDocument,
  deleteWatermarkFromCanvas,
  normalizeCaptionSettings,
  normalizeWatermarkSettings,
  parseCanvasPresetDocument,
} from "@/lib/canvas-presets";
import { pruneCanvasVersions } from "@/lib/canvas-versions";
import { prisma } from "@/lib/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "캔버스 일괄 설정이 필요합니다." }, { status: 400 });
    }
    const kind = body.kind === "watermark" || body.kind === "caption" ? body.kind : null;
    const action = body.action === "delete" ? "delete" : "apply";
    const scope = body.scope === "range" ? "range" : "all";
    if (!kind || (kind === "caption" && action === "delete")) {
      return NextResponse.json({ error: "지원하지 않는 캔버스 설정입니다." }, { status: 400 });
    }

    const project = await prisma.creativeProject.findFirst({
      where: { id, userId: session.userId },
      select: {
        id: true,
        aspectRatio: true,
        canvasWidth: true,
        canvasHeight: true,
        cuts: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            canvas: true,
            imageUrl: true,
            thumbnailUrl: true,
          },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    const start = Math.max(1, Math.min(project.cuts.length, Math.floor(Number(body.start) || 1)));
    const end = Math.max(start, Math.min(project.cuts.length, Math.floor(Number(body.end) || project.cuts.length)));
    const excludeCutId = typeof body.excludeCutId === "string" ? body.excludeCutId : "";
    const settings = isRecord(body.settings) ? body.settings : {};
    const targetCuts = project.cuts.filter((cut, index) => (
      cut.id !== excludeCutId && (scope === "all" || (index + 1 >= start && index + 1 <= end))
    ));

    const changedCutIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const cut of targetCuts) {
        let canvas = parseCanvasPresetDocument(cut.canvas);
        if (!canvas) {
          if (kind === "caption" || action === "delete") continue;
          canvas = createCanvasPresetDocument({
            width: project.canvasWidth,
            height: project.canvasHeight,
            aspect: project.aspectRatio,
            imageUrl: cut.imageUrl,
          });
        }

        const next = kind === "watermark"
          ? action === "delete"
            ? deleteWatermarkFromCanvas(canvas)
            : applyWatermarkToCanvas(canvas, normalizeWatermarkSettings(settings))
          : applyCaptionStyleToCanvas(canvas, normalizeCaptionSettings(settings)).canvas;
        if (JSON.stringify(next) === JSON.stringify(canvas)) continue;
        if (JSON.stringify(next).length > 200_000) {
          throw new Error("캔버스 편집 정보가 너무 큽니다.");
        }

        if (cut.imageUrl && cut.canvas) {
          await tx.canvasVersion.create({
            data: {
              cutId: cut.id,
              imageUrl: cut.imageUrl,
              thumbnailUrl: cut.thumbnailUrl,
              canvas: cut.canvas as Prisma.InputJsonValue,
              source: "preset-batch",
              label: kind === "watermark" ? "워터마크 일괄 설정 전" : "캡션 일괄 설정 전",
            },
          });
        }
        await tx.projectCut.update({
          where: { id: cut.id },
          data: { canvas: next as Prisma.InputJsonValue },
        });
        changedCutIds.push(cut.id);
      }
    });

    await Promise.allSettled(changedCutIds.map((cutId) => pruneCanvasVersions(cutId)));
    return NextResponse.json({ ok: true, updated: changedCutIds.length, cutIds: changedCutIds });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Canvas preset batch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캔버스 일괄 설정을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
