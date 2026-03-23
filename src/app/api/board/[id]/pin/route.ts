import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// POST: 핀 토글 (관리자만)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    // 관리자 확인
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (user?.role !== "admin") {
      return NextResponse.json({ error: "관리자만 핀을 설정할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    const post = await prisma.boardPost.findUnique({
      where: { id },
      select: { pinned: true },
    });

    if (!post) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.boardPost.update({
      where: { id },
      data: { pinned: !post.pinned },
    });

    return NextResponse.json({ pinned: updated.pinned });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "핀 처리 실패" }, { status: 500 });
  }
}
