import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();

    const groups = await prisma.characterGroup.findMany({
      where: { userId: session.userId },
      include: {
        presets: {
          include: { images: { orderBy: { order: "asc" }, take: 4 } },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        order: g.order,
        presets: g.presets.map((p) => {
          const repImage =
            p.images.find((img) => img.id === p.representativeImageId) ??
            p.images[0] ??
            null;
          return {
            id: p.id,
            alias: p.alias,
            name: p.name,
            order: p.order,
            representativeImage: repImage
              ? { id: repImage.id, dataUrl: repImage.blobUrl }
              : null,
            images: p.images.map((img) => ({
              id: img.id,
              dataUrl: img.blobUrl,
            })),
          };
        }),
      }))
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "그룹 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { name } = (await req.json()) as { name: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "그룹 이름을 입력해주세요." }, { status: 400 });
    }

    const maxOrder = await prisma.characterGroup.aggregate({
      where: { userId: session.userId },
      _max: { order: true },
    });

    const group = await prisma.characterGroup.create({
      data: {
        name: name.trim(),
        userId: session.userId,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ id: group.id, name: group.name, order: group.order, presets: [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "그룹 생성 실패" }, { status: 500 });
  }
}
