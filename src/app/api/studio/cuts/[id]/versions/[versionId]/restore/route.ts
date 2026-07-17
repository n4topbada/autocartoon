import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { pruneCanvasVersions } from "@/lib/canvas-versions";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, versionId } = await params;
    const version = await prisma.canvasVersion.findFirst({
      where: {
        id: versionId,
        cutId: id,
        cut: { project: { userId: session.userId } },
      },
    });
    if (!version) return NextResponse.json({ error: "복원할 버전을 찾을 수 없습니다." }, { status: 404 });

    const cut = await prisma.$transaction(async (tx) => {
      const current = await tx.projectCut.findUnique({ where: { id } });
      if (!current) throw new Error("컷을 찾을 수 없습니다.");
      if (current.imageUrl) {
        await tx.canvasVersion.create({
          data: {
            cutId: id,
            imageUrl: current.imageUrl,
            thumbnailUrl: current.thumbnailUrl,
            canvas: current.canvas ?? Prisma.JsonNull,
            source: "restore-backup",
            label: "복원 전 자동 백업",
          },
        });
      }
      return tx.projectCut.update({
        where: { id },
        data: {
          imageUrl: version.imageUrl,
          thumbnailUrl: version.thumbnailUrl,
          canvas: version.canvas ?? Prisma.JsonNull,
        },
      });
    });
    await pruneCanvasVersions(id).catch((error) => {
      console.error("Canvas version prune error:", error);
    });
    return NextResponse.json({ cut });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Canvas version restore error:", error);
    return NextResponse.json({ error: "이 버전으로 복원하지 못했습니다." }, { status: 500 });
  }
}
