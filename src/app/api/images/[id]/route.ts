import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";

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

    const updated = await prisma.generatedImage.update({
      where: { id },
      data: { favorite: !image.favorite },
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

    // Blob 파일 삭제
    if (image.blobUrl) {
      await deleteBlob(image.blobUrl);
    }

    // DB 레코드 삭제
    await prisma.generatedImage.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image delete error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
