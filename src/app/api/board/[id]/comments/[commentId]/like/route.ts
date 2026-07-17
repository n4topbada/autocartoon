import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// POST: 댓글 좋아요 토글 (원자적·멱등)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { commentId } = await params;

    const removed = await prisma.boardLike.deleteMany({
      where: { userId: session.userId, commentId },
    });
    if (removed.count > 0) {
      return NextResponse.json({ liked: false });
    }
    try {
      await prisma.boardLike.create({ data: { userId: session.userId, commentId } });
    } catch (createError) {
      if (
        !(createError instanceof Prisma.PrismaClientKnownRequestError) ||
        createError.code !== "P2002"
      ) {
        throw createError;
      }
    }
    return NextResponse.json({ liked: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "좋아요 처리 실패" }, { status: 500 });
  }
}
