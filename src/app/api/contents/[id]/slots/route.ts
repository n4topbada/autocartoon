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

    const { imageId, order } = (await req.json()) as { imageId?: unknown; order?: unknown };

    if (typeof imageId !== "string" || !imageId) {
      return NextResponse.json({ error: "imageId는 필수입니다" }, { status: 400 });
    }

    // 자신의 이미지만 슬롯에 넣을 수 있다(IDOR 방지). ContentSlot.imageId에는 FK가 없으므로
    // 여기서 존재·소유권을 확인하지 않으면 임의 이미지 URL이 노출될 수 있다.
    const image = await prisma.generatedImage.findFirst({
      where: { id: imageId, request: { userId: session.userId } },
      select: { id: true },
    });
    if (!image) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다" }, { status: 404 });
    }

    const requestedOrder =
      typeof order === "number" && Number.isFinite(order) ? Math.floor(order) : undefined;

    const slot = await prisma.$transaction(async (tx) => {
      const last = await tx.contentSlot.findFirst({
        where: { contentId: id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const appendOrder = (last?.order ?? -1) + 1;
      const insertOrder =
        requestedOrder === undefined
          ? appendOrder
          : Math.max(0, Math.min(appendOrder, requestedOrder));
      // 중간 삽입이면 뒤 슬롯을 한 칸씩 밀어 순번 중복을 막는다.
      if (insertOrder < appendOrder) {
        await tx.contentSlot.updateMany({
          where: { contentId: id, order: { gte: insertOrder } },
          data: { order: { increment: 1 } },
        });
      }
      const created = await tx.contentSlot.create({
        data: { contentId: id, imageId, order: insertOrder },
      });
      await tx.content.update({ where: { id }, data: { updatedAt: new Date() } });
      return created;
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

    if (
      !Array.isArray(slots) ||
      slots.some((s) => typeof s?.id !== "string" || typeof s?.order !== "number")
    ) {
      return NextResponse.json({ error: "slots 배열이 필요합니다" }, { status: 400 });
    }

    // contentId를 함께 제약해 다른 사용자의 슬롯 순번을 덮어쓰지 못하게 한다(IDOR 방지).
    // updateMany는 존재하지 않는 id에 대해 0행을 반환하므로 P2025(500)도 피한다.
    await prisma.$transaction(
      slots.map((s) =>
        prisma.contentSlot.updateMany({
          where: { id: s.id, contentId: id },
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
