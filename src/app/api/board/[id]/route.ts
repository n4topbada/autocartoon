import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.boardPost.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
    }

    // Resolve imageIds to actual image URLs
    let images: { id: string; blobUrl: string; mimeType: string }[] = [];
    if (post.imageIds.length > 0) {
      images = await prisma.generatedImage.findMany({
        where: { id: { in: post.imageIds } },
        select: { id: true, blobUrl: true, mimeType: true },
      });
    }

    return NextResponse.json({
      ...post,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      images,
      comments: post.comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "게시글 조회 실패" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const post = await prisma.boardPost.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
    }

    if (post.userId !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
    }

    await prisma.boardPost.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "게시글 삭제 실패" }, { status: 500 });
  }
}
