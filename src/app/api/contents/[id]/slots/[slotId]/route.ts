import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, slotId } = await params;

    const content = await prisma.content.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!content) {
      return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다" }, { status: 404 });
    }

    if (content.userId !== session.userId) {
      return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
    }

    const slot = await prisma.contentSlot.findUnique({
      where: { id: slotId },
      select: { contentId: true },
    });

    if (!slot || slot.contentId !== id) {
      return NextResponse.json({ error: "슬롯을 찾을 수 없습니다" }, { status: 404 });
    }

    await prisma.contentSlot.delete({ where: { id: slotId } });

    // Touch content updatedAt
    await prisma.content.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delete slot error:", error);
    return NextResponse.json({ error: "슬롯 삭제 실패" }, { status: 500 });
  }
}
