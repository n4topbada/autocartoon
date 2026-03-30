import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        slots: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!content) {
      return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다" }, { status: 404 });
    }

    if (content.userId !== session.userId) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // Resolve all slot imageIds to blobUrls
    const imageIds = content.slots.map((s) => s.imageId);
    const images =
      imageIds.length > 0
        ? await prisma.generatedImage.findMany({
            where: { id: { in: imageIds } },
            select: { id: true, blobUrl: true },
          })
        : [];

    const imageMap = new Map(images.map((img) => [img.id, img.blobUrl]));

    return NextResponse.json({
      id: content.id,
      title: content.title,
      comment: content.comment,
      createdAt: content.createdAt.toISOString(),
      updatedAt: content.updatedAt.toISOString(),
      slots: content.slots.map((s) => ({
        id: s.id,
        imageId: s.imageId,
        blobUrl: imageMap.get(s.imageId) ?? null,
        order: s.order,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "콘텐츠 조회 실패" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const content = await prisma.content.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!content) {
      return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다" }, { status: 404 });
    }

    if (content.userId !== session.userId) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const data: { title?: string; comment?: string } = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.comment !== undefined) data.comment = body.comment;

    const updated = await prisma.content.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      comment: updated.comment,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Update content error:", error);
    return NextResponse.json({ error: "콘텐츠 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const content = await prisma.content.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!content) {
      return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다" }, { status: 404 });
    }

    if (content.userId !== session.userId) {
      return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
    }

    // ContentSlot has onDelete: Cascade, so slots are auto-deleted
    await prisma.content.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "콘텐츠 삭제 실패" }, { status: 500 });
  }
}
