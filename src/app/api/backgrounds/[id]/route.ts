import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const bg = await prisma.savedBackground.findFirst({
      where: { id, userId: session.userId },
    });
    if (!bg) {
      return NextResponse.json({ error: "배경을 찾을 수 없습니다." }, { status: 404 });
    }

    const deleted = await prisma.savedBackground.deleteMany({
      where: { id, userId: session.userId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "배경을 찾을 수 없습니다." }, { status: 404 });
    }

    // DB 소유권 검증과 삭제가 끝난 뒤 연결된 Blob도 정리한다.
    if (bg?.blobUrl) {
      await deleteBlob(bg.blobUrl);
    }
    if (bg?.thumbnailUrl) {
      await deleteBlob(bg.thumbnailUrl);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delete background error:", error);
    return NextResponse.json(
      { error: "삭제 실패" },
      { status: 500 }
    );
  }
}
