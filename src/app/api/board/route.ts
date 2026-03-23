import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, Number(searchParams.get("limit") || "20")), 100);
    const skip = (page - 1) * limit;

    // 현재 사용자 (좋아요 여부 체크용, 비로그인 허용) — 정적 import 사용
    let currentUserId: string | null = null;
    try {
      const session = await requireAuth();
      currentUserId = session.userId;
    } catch { /* 비로그인 */ }

    const [posts, total] = await Promise.all([
      prisma.boardPost.findMany({
        skip,
        take: limit,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { comments: true, likes: true } },
          ...(currentUserId
            ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
            : {}),
        },
      }),
      prisma.boardPost.count(),
    ]);

    // 모든 첫번째 imageId를 모아서 한번에 조회 (N+1 → 1 쿼리)
    const firstImageIds = posts
      .map((p) => p.imageIds[0])
      .filter((id): id is string => !!id);

    const previewImages = firstImageIds.length > 0
      ? await prisma.generatedImage.findMany({
          where: { id: { in: firstImageIds } },
          select: { id: true, blobUrl: true },
        })
      : [];

    const previewMap = new Map(previewImages.map((img) => [img.id, img.blobUrl]));

    const postsWithPreview = posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      imageIds: post.imageIds,
      links: post.links,
      previewImageUrl: post.imageIds[0] ? previewMap.get(post.imageIds[0]) ?? null : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      user: post.user,
      commentCount: post._count.comments,
      likeCount: post._count.likes,
      liked: (post as unknown as { likes?: { id: string }[] }).likes?.length ? true : false,
      pinned: post.pinned,
    }));

    return NextResponse.json({
      posts: postsWithPreview,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "게시글 목록 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();

    const { title, content, imageIds, links } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
    }
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
    }

    const post = await prisma.boardPost.create({
      data: {
        userId: session.userId,
        title: title.trim(),
        content: content.trim(),
        imageIds: Array.isArray(imageIds) ? imageIds : [],
        links: Array.isArray(links) ? links : [],
      },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "게시글 작성 실패" }, { status: 500 });
  }
}
