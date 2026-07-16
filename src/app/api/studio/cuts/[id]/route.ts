import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ownedCut(id: string, userId: string) {
  return prisma.projectCut.findFirst({
    where: { id, project: { userId } },
    select: { id: true, projectId: true, order: true },
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
    const updated = await prisma.projectCut.update({
      where: { id },
      data: {
        ...(typeof body.title === "string" ? { title: body.title.trim().slice(0, 80) || "제목 없음" } : {}),
        ...(typeof body.prompt === "string" ? { prompt: body.prompt.slice(0, 10_000) } : {}),
        ...(typeof body.negativePrompt === "string" ? { negativePrompt: body.negativePrompt.slice(0, 2_000) } : {}),
        ...(typeof body.dialogue === "string" ? { dialogue: body.dialogue.slice(0, 5_000) } : {}),
        ...(typeof body.speakerPresetId === "string" ? { speakerPresetId: body.speakerPresetId.slice(0, 128) } : {}),
        ...(duration ? { durationMs: duration } : {}),
        ...(body.canvas && typeof body.canvas === "object" ? { canvas: body.canvas } : {}),
        ...(body.scene && typeof body.scene === "object" ? { scene: body.scene } : {}),
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
      await tx.projectCut.updateMany({
        where: { projectId: cut.projectId, order: { gt: cut.order } },
        data: { order: { decrement: 1 } },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "컷을 삭제하지 못했습니다." }, { status: 500 });
  }
}
