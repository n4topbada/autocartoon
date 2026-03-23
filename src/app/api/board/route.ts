import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, Number(searchParams.get("limit") || "20")), 100);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.boardPost.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.boardPost.count(),
    ]);

    // Resolve first imageId to get preview URL
    const postsWithPreview = await Promise.all(
      posts.map(async (post) => {
        let previewImageUrl: string | null = null;
        if (post.imageIds.length > 0) {
          const image = await prisma.generatedImage.findUnique({
            where: { id: post.imageIds[0] },
            select: { blobUrl: true },
          });
          previewImageUrl = image?.blobUrl ?? null;
        }
        return {
          id: post.id,
          title: post.title,
          content: post.content,
          imageIds: post.imageIds,
          links: post.links,
          previewImageUrl,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          user: post.user,
          commentCount: post._count.comments,
        };
      })
    );

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
