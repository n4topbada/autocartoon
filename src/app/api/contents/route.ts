import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();

    const contents = await prisma.content.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        slots: {
          orderBy: { order: "asc" },
          take: 1,
        },
      },
    });

    // Resolve first slot's imageId to blobUrl for thumbnail
    const firstImageIds = contents
      .map((c) => c.slots[0]?.imageId)
      .filter(Boolean) as string[];

    const images =
      firstImageIds.length > 0
        ? await prisma.generatedImage.findMany({
            where: { id: { in: firstImageIds } },
            select: { id: true, blobUrl: true },
          })
        : [];

    const imageMap = new Map(images.map((img) => [img.id, img.blobUrl]));

    return NextResponse.json(
      contents.map((c) => ({
        id: c.id,
        title: c.title,
        comment: c.comment,
        thumbnail: c.slots[0] ? imageMap.get(c.slots[0].imageId) ?? null : null,
        slotCount: c.slots.length,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "콘텐츠 목록 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const title = body.title?.trim() || "새 콘텐츠";

    const content = await prisma.content.create({
      data: {
        userId: session.userId,
        title,
      },
    });

    return NextResponse.json({
      id: content.id,
      title: content.title,
      comment: content.comment,
      createdAt: content.createdAt.toISOString(),
      updatedAt: content.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Create content error:", error);
    return NextResponse.json({ error: "콘텐츠 생성 실패" }, { status: 500 });
  }
}
