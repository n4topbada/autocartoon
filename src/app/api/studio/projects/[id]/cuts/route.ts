import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: projectId } = await params;
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true, _count: { select: { cuts: true } } },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    if (project._count.cuts >= 30) {
      return NextResponse.json({ error: "프로젝트에는 최대 30개 컷을 만들 수 있습니다." }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string; sourceCutId?: string };
    const source = body.sourceCutId
      ? await prisma.projectCut.findFirst({ where: { id: body.sourceCutId, projectId } })
      : null;
    if (body.sourceCutId && !source) {
      return NextResponse.json({ error: "복제할 컷을 찾을 수 없습니다." }, { status: 404 });
    }
    const last = await prisma.projectCut.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;
    const cut = await prisma.projectCut.create({
      data: {
        projectId,
        order,
        title: body.title?.trim().slice(0, 80) || (source ? `${source.title} 복사본` : `컷 ${order + 1}`),
        ...(source
          ? {
              durationMs: source.durationMs,
              prompt: source.prompt,
              negativePrompt: source.negativePrompt,
              dialogue: source.dialogue,
              speakerPresetId: source.speakerPresetId,
              scene: source.scene ?? undefined,
              canvas: source.canvas ?? undefined,
              imageUrl: source.imageUrl,
              thumbnailUrl: source.thumbnailUrl,
              videoUrl: source.videoUrl,
            }
          : {}),
      },
    });
    return NextResponse.json({ cut }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Cut create error:", error);
    return NextResponse.json({ error: "컷을 추가하지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: projectId } = await params;
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      include: { cuts: { orderBy: { order: "asc" }, select: { id: true } } },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { orderedIds?: unknown } | null;
    if (!Array.isArray(body?.orderedIds) || body.orderedIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "orderedIds 배열이 필요합니다." }, { status: 400 });
    }
    const orderedIds = body.orderedIds as string[];
    const existingIds = new Set(project.cuts.map((cut) => cut.id));
    if (
      orderedIds.length !== project.cuts.length ||
      new Set(orderedIds).size !== orderedIds.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      return NextResponse.json({ error: "프로젝트의 모든 컷을 중복 없이 포함해야 합니다." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectCut.updateMany({
        where: { projectId },
        data: { order: { increment: 1_000 } },
      });
      for (let order = 0; order < orderedIds.length; order += 1) {
        await tx.projectCut.update({ where: { id: orderedIds[order] }, data: { order } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Cut reorder error:", error);
    return NextResponse.json({ error: "컷 순서를 저장하지 못했습니다." }, { status: 500 });
  }
}
