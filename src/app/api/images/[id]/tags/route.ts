import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: imageId } = await params;
    const { tagId } = (await req.json()) as { tagId: string };

    // 이미지 소유 확인
    const image = await prisma.generatedImage.findUnique({
      where: { id: imageId },
      include: { request: { select: { userId: true } } },
    });
    if (!image || (image.request.userId !== session.userId && session.role !== "admin")) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 태그 소유 확인
    const tag = await prisma.imageTag.findUnique({ where: { id: tagId } });
    if (!tag || tag.userId !== session.userId) {
      return NextResponse.json({ error: "태그를 찾을 수 없습니다." }, { status: 404 });
    }

    // 토글: 있으면 제거, 없으면 추가
    const existing = await prisma.imageTagLink.findUnique({
      where: { imageId_tagId: { imageId, tagId } },
    });

    if (existing) {
      await prisma.imageTagLink.delete({ where: { id: existing.id } });
      return NextResponse.json({ action: "removed", tagId });
    } else {
      await prisma.imageTagLink.create({ data: { imageId, tagId } });
      return NextResponse.json({ action: "added", tagId });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "태그 토글 실패" }, { status: 500 });
  }
}
