import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
  const session = await requireAuth();
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("presetId");
  const limit = Math.min(Number(searchParams.get("limit") || "20"), 100);

  // 관리자는 ?userId= 로 다른 유저 데이터 조회 가능
  let targetUserId = session.userId;
  if (session.role === "admin" && searchParams.get("userId")) {
    targetUserId = searchParams.get("userId")!;
  }

  const favoritesOnly = searchParams.get("favorites") === "true";

  const where: Record<string, unknown> = { userId: targetUserId };
  if (presetId) where.presetId = presetId;

  // 즐겨찾기 필터: 즐겨찾기 이미지가 있는 요청만
  if (favoritesOnly) {
    where.generatedImages = { some: { favorite: true } };
  }

  const requests = await prisma.generationRequest.findMany({
    where,
    include: {
      preset: { select: { name: true, alias: true } },
      backgroundImage: { select: { name: true } },
      generatedImages: {
        where: favoritesOnly ? { favorite: true } : {},
        select: {
          id: true, mimeType: true, blobUrl: true, favorite: true,
          tagLinks: { include: { tag: { select: { id: true, name: true, color: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const result = requests
    .filter((r) => r.generatedImages.length > 0)
    .map((r) => ({
      id: r.id,
      mode: r.mode,
      prompt: r.prompt,
      background: r.background,
      backgroundImageName: r.backgroundImage?.name || null,
      presetName: r.preset.name,
      createdAt: r.createdAt.toISOString(),
      images: r.generatedImages.map((img) => ({
        id: img.id,
        mimeType: img.mimeType,
        dataUrl: img.blobUrl,
        favorite: img.favorite,
        tags: img.tagLinks.map((tl) => ({ id: tl.tag.id, name: tl.tag.name, color: tl.tag.color })),
      })),
    }));

  return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "히스토리 조회 실패" }, { status: 500 });
  }
}
