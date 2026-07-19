import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeVideoProvider } from "@/lib/video-providers";

async function ownedCut(id: string, userId: string) {
  return prisma.projectCut.findFirst({
    where: { id, project: { userId } },
    select: { id: true, projectId: true, order: true, videoUrl: true },
  });
}

function normalizeDialoguePlan(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 1_000) : "";
    if (!text) return [];
    return [{
      id: typeof record.id === "string" ? record.id.slice(0, 128) : `dialogue_${index}`,
      text,
      speakerPresetId: typeof record.speakerPresetId === "string"
        ? record.speakerPresetId.slice(0, 128)
        : null,
    }];
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const cut = await ownedCut(id, session.userId);
    if (!cut) return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    const duration = typeof body.durationMs === "number"
      ? Math.max(1000, Math.min(30_000, Math.round(body.durationMs)))
      : undefined;
    const dialoguePlan = body.dialoguePlan === undefined
      ? undefined
      : normalizeDialoguePlan(body.dialoguePlan);
    if (body.dialoguePlan !== undefined && !dialoguePlan) {
      return NextResponse.json({ error: "대사 구성은 배열이어야 합니다." }, { status: 400 });
    }
    let sourceAsset: { blobUrl: string; thumbnailUrl: string | null } | null | undefined;
    if (body.sourceAssetId === null) {
      sourceAsset = null;
    } else if (typeof body.sourceAssetId === "string") {
      sourceAsset = await prisma.projectAsset.findFirst({
        where: {
          id: body.sourceAssetId,
          projectId: cut.projectId,
          kind: "image",
          project: { userId: session.userId },
        },
        select: { blobUrl: true, thumbnailUrl: true },
      });
      if (!sourceAsset) {
        return NextResponse.json({ error: "시작 이미지를 찾을 수 없습니다." }, { status: 404 });
      }
    }
    const generationChanged = [
      "prompt",
      "videoPrompt",
      "negativePrompt",
      "videoProvider",
      "videoResolution",
      "videoGenerateAudio",
      "durationMs",
      "sourceAssetId",
    ].some((key) => body[key] !== undefined);
    if (body.videoApproved === true && !cut.videoUrl) {
      return NextResponse.json({ error: "완성된 씬 영상이 없습니다." }, { status: 400 });
    }
    const updated = await prisma.projectCut.update({
      where: { id },
      data: {
        ...(typeof body.title === "string" ? { title: body.title.trim().slice(0, 80) || "제목 없음" } : {}),
        ...(typeof body.prompt === "string" ? { prompt: body.prompt.slice(0, 10_000) } : {}),
        ...(typeof body.videoPrompt === "string"
          ? { videoPrompt: body.videoPrompt.trim().slice(0, 5_000) || null }
          : {}),
        ...(body.videoProvider !== undefined
          ? { videoProvider: normalizeVideoProvider(body.videoProvider) }
          : {}),
        ...(body.videoResolution === "720p" || body.videoResolution === "1080p"
          ? { videoResolution: body.videoResolution }
          : {}),
        ...(typeof body.videoGenerateAudio === "boolean"
          ? { videoGenerateAudio: body.videoGenerateAudio }
          : {}),
        ...(typeof body.negativePrompt === "string" ? { negativePrompt: body.negativePrompt.slice(0, 2_000) } : {}),
        ...(typeof body.dialogue === "string" ? { dialogue: body.dialogue.slice(0, 5_000) } : {}),
        ...(dialoguePlan !== undefined ? { dialoguePlan } : {}),
        ...(typeof body.speakerPresetId === "string"
          ? { speakerPresetId: body.speakerPresetId.trim().slice(0, 128) || null }
          : {}),
        ...(duration ? { durationMs: duration } : {}),
        ...(body.canvas && typeof body.canvas === "object" ? { canvas: body.canvas } : {}),
        ...(body.scene && typeof body.scene === "object" ? { scene: body.scene } : {}),
        ...(sourceAsset === null
          ? { imageUrl: null, thumbnailUrl: null }
          : sourceAsset
            ? { imageUrl: sourceAsset.blobUrl, thumbnailUrl: sourceAsset.thumbnailUrl }
            : {}),
        ...(body.videoApproved === true
          ? { videoApprovedAt: new Date() }
          : body.videoApproved === false || generationChanged
            ? { videoApprovedAt: null }
            : {}),
      },
    });
    return NextResponse.json({ cut: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "컷을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const cut = await ownedCut(id, session.userId);
    if (!cut) return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.projectCut.delete({ where: { id } });
      // 남은 컷 순번을 두 단계(+1000 후 0..n)로 다시 매겨
      // @@unique([projectId, order]) 충돌(P2002)을 피한다. (reorder 라우트와 동일 방식)
      const remaining = await tx.projectCut.findMany({
        where: { projectId: cut.projectId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      await tx.projectCut.updateMany({
        where: { projectId: cut.projectId },
        data: { order: { increment: 1_000 } },
      });
      for (let order = 0; order < remaining.length; order += 1) {
        await tx.projectCut.update({ where: { id: remaining[order].id }, data: { order } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "컷을 삭제하지 못했습니다." }, { status: 500 });
  }
}
