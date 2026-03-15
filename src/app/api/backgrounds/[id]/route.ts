import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    // Blob 파일도 삭제
    const bg = await prisma.savedBackground.findUnique({ where: { id } });
    if (bg?.blobUrl) {
      await deleteBlob(bg.blobUrl);
    }

    await prisma.savedBackground.delete({ where: { id } });
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
