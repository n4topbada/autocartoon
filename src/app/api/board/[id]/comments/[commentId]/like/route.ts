import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// POST: 댓글 좋아요 토글
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { commentId } = await params;

    const existing = await prisma.boardLike.findUnique({
      where: { userId_commentId: { userId: session.userId, commentId } },
    });

    if (existing) {
      await prisma.boardLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ liked: false });
    } else {
      await prisma.boardLike.create({
        data: { userId: session.userId, commentId },
      });
      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "좋아요 처리 실패" }, { status: 500 });
  }
}
