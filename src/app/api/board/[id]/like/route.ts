import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// POST: 글 좋아요 토글 (원자적·멱등: 동시 더블클릭에도 500이 나지 않음)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const removed = await prisma.boardLike.deleteMany({
      where: { userId: session.userId, postId: id },
    });
    if (removed.count > 0) {
      return NextResponse.json({ liked: false });
    }
    try {
      await prisma.boardLike.create({ data: { userId: session.userId, postId: id } });
    } catch (createError) {
      // 동시 요청이 먼저 생성한 경우(P2002)도 '좋아요됨'으로 수렴시킨다.
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
