import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 게시글/댓글 신고. body.commentId가 있으면 댓글 신고, 없으면 게시글 신고.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: postId } = await params;
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown; commentId?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1_000) : "";
    const commentId = typeof body.commentId === "string" ? body.commentId : null;
    if (!reason) {
      return NextResponse.json({ error: "신고 사유를 입력해주세요." }, { status: 400 });
    }

    if (commentId) {
      const comment = await prisma.boardComment.findFirst({
        where: { id: commentId, postId },
        select: { id: true },
      });
      if (!comment) return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
    } else {
      const post = await prisma.boardPost.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    // 같은 대상에 대한 미처리 중복 신고를 막는다.
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: session.userId,
        status: "open",
        ...(commentId ? { commentId } : { postId, commentId: null }),
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ message: "이미 신고한 항목입니다.", duplicated: true });
    }

    await prisma.report.create({
      data: {
        reporterId: session.userId,
        postId: commentId ? null : postId,
        commentId,
        reason,
      },
    });
    return NextResponse.json({ message: "신고가 접수되었습니다." });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Report error:", error);
    return NextResponse.json({ error: "신고를 접수하지 못했습니다." }, { status: 500 });
  }
}
