import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();

    // 시스템 프리셋 (userId=null) 전체 목록
    const presets = await prisma.characterPreset.findMany({
      where: { userId: null },
      include: {
        images: { orderBy: { order: "asc" }, take: 4 },
        purchasedBy: {
          where: { userId: session.userId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = presets.map((p) => ({
      id: p.id,
      alias: p.alias,
      name: p.name,
      price: p.price,
      owned: p.purchasedBy.length > 0,
      images: p.images.map((img) => ({
        id: img.id,
        dataUrl: img.blobUrl,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "마켓플레이스 조회 실패" }, { status: 500 });
  }
}
