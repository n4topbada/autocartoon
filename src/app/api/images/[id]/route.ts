import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlobIfUnreferenced } from "@/lib/blob-references";

// 즐겨찾기 토글
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // 이미지 소유권 확인
    const image = await prisma.generatedImage.findUnique({
      where: { id },
      include: { request: { select: { userId: true } } },
    });

    if (!image) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    if (image.request.userId !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 클라이언트가 목표 상태를 보내면 그대로 설정(멱등). 없으면 기존처럼 토글한다.
    const body = (await req.json().catch(() => ({}))) as { favorite?: unknown };
    const target = typeof body.favorite === "boolean" ? body.favorite : !image.favorite;
    const updated = await prisma.generatedImage.update({
      where: { id },
      data: { favorite: target },
    });

    return NextResponse.json({ id: updated.id, favorite: updated.favorite });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
  }
}

// 이미지 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const image = await prisma.generatedImage.findUnique({
      where: { id },
      include: { request: { select: { userId: true } } },
    });

    if (!image) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    if (image.request.userId !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 이미지에 대한 ID 참조(ContentSlot.imageId, BoardPost.imageIds)를 함께 정리한다.
    // 그렇지 않으면 콘텐츠 슬롯이 '없음'으로 깨지거나, blob-references가 URL만 검사하는 탓에
    // 아직 참조 중인 blob이 삭제된다.
    await prisma.$transaction(async (tx) => {
      await tx.contentSlot.deleteMany({ where: { imageId: id } });
      const referencingPosts = await tx.boardPost.findMany({
        where: { imageIds: { has: id } },
        select: { id: true, imageIds: true },
      });
      for (const post of referencingPosts) {
        await tx.boardPost.update({
          where: { id: post.id },
          data: { imageIds: post.imageIds.filter((imageId) => imageId !== id) },
        });
      }
      await tx.generatedImage.delete({ where: { id } });
      // 요청에 남은 이미지가 없으면 요청도 삭제
      const remaining = await tx.generatedImage.count({
        where: { requestId: image.requestId },
      });
      if (remaining === 0) {
        await tx.generationRequest.delete({ where: { id: image.requestId } });
      }
    });

    await Promise.all([
      deleteBlobIfUnreferenced(image.blobUrl),
      deleteBlobIfUnreferenced(image.thumbnailUrl),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image delete error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
