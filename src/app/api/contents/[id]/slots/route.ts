import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

const MAX_SLOTS = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const content = await prisma.content.findUnique({
      where: { id },
      select: { userId: true, _count: { select: { slots: true } } },
    });

    if (!content) {
      return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다" }, { status: 404 });
    }

    if (content.userId !== session.userId) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    if (content._count.slots >= MAX_SLOTS) {
      return NextResponse.json(
        { error: `슬롯은 최대 ${MAX_SLOTS}개까지 추가할 수 있습니다` },
        { status: 400 }
      );
    }

    const { imageId, order } = await req.json();

    if (!imageId) {
      return NextResponse.json({ error: "imageId는 필수입니다" }, { status: 400 });
    }

    const slot = await prisma.contentSlot.create({
      data: {
        contentId: id,
        imageId,
        order: order ?? content._count.slots,
      },
    });

    // Touch content updatedAt
    await prisma.content.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      id: slot.id,
      contentId: slot.contentId,
      imageId: slot.imageId,
      order: slot.order,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Add slot error:", error);
    return NextResponse.json({ error: "슬롯 추가 실패" }, { status: 500 });
  }
}

export async function PUT(
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
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    const { slots } = (await req.json()) as {
      slots: { id: string; order: number }[];
    };

    if (!Array.isArray(slots)) {
      return NextResponse.json({ error: "slots 배열이 필요합니다" }, { status: 400 });
    }

    // Bulk update order in a transaction
    await prisma.$transaction(
      slots.map((s) =>
        prisma.contentSlot.update({
          where: { id: s.id },
          data: { order: s.order },
        })
      )
    );

    // Touch content updatedAt
    await prisma.content.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reorder slots error:", error);
    return NextResponse.json({ error: "슬롯 순서 변경 실패" }, { status: 500 });
  }
}
