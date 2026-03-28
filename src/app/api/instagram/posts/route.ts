import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();

    const igAccount = await prisma.instagramAccount.findUnique({
      where: { userId: session.userId },
    });
    if (!igAccount) {
      return NextResponse.json({ error: "Instagram 계정이 연동되지 않았습니다." }, { status: 400 });
    }

    const posts = await prisma.instagramPost.findMany({
      where: { accountId: igAccount.id },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    // 이미지 URL 조회
    const imageIds = posts.map((p) => p.imageId).filter(Boolean) as string[];
    const images = await prisma.generatedImage.findMany({
      where: { id: { in: imageIds } },
      select: { id: true, blobUrl: true },
    });
    const imageMap = new Map(images.map((img) => [img.id, img.blobUrl]));

    return NextResponse.json(
      posts.map((p) => ({
        id: p.id,
        igMediaId: p.igMediaId,
        caption: p.caption,
        permalink: p.permalink,
        publishedAt: p.publishedAt.toISOString(),
        imageUrl: p.imageId ? imageMap.get(p.imageId) || null : null,
        impressions: p.impressions,
        reach: p.reach,
        likes: p.likes,
        comments: p.comments,
        saves: p.saves,
        shares: p.shares,
        insightsUpdatedAt: p.insightsUpdatedAt?.toISOString() || null,
      }))
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "게시물 조회 실패" }, { status: 500 });
  }
}
