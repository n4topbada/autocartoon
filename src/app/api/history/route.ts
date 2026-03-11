import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("presetId");
  const limit = Math.min(Number(searchParams.get("limit") || "20"), 100);

  const where = presetId ? { presetId } : {};

  const requests = await prisma.generationRequest.findMany({
    where,
    include: {
      preset: { select: { name: true, alias: true } },
      backgroundImage: { select: { name: true } },
      generatedImages: {
        select: { id: true, mimeType: true, imageData: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const result = requests.map((r) => ({
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
      dataUrl: `data:${img.mimeType};base64,${img.imageData}`,
    })),
  }));

  return NextResponse.json(result);
}
