import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { publishImage } from "@/lib/instagram";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { imageId, caption } = (await req.json()) as { imageId: string; caption?: string };

    if (!imageId) {
      return NextResponse.json({ error: "imageId가 필요합니다." }, { status: 400 });
    }

    // Instagram 계정 확인
    const igAccount = await prisma.instagramAccount.findUnique({
      where: { userId: session.userId },
    });
    if (!igAccount) {
      return NextResponse.json({ error: "Instagram 계정이 연동되지 않았습니다." }, { status: 400 });
    }

    // 이미지 조회
    const image = await prisma.generatedImage.findUnique({ where: { id: imageId } });
    if (!image) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    // Instagram 발행
    const result = await publishImage(
      igAccount.igUserId,
      igAccount.accessToken,
      image.blobUrl,
      caption || ""
    );

    // DB 저장
    const post = await prisma.instagramPost.create({
      data: {
        accountId: igAccount.id,
        igMediaId: result.mediaId,
        imageId,
        caption: caption || "",
        permalink: result.permalink,
        publishedAt: new Date(),
      },
    });

    return NextResponse.json({
      id: post.id,
      permalink: result.permalink,
      igMediaId: result.mediaId,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Instagram publish error:", error);
    const msg = error instanceof Error ? error.message : "발행 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
