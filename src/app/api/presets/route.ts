import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const presets = await prisma.characterPreset.findMany({
    include: {
      images: { orderBy: { order: "asc" }, take: 4 },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = presets.map((p) => ({
    id: p.id,
    alias: p.alias,
    name: p.name,
    images: p.images.map((img) => ({
      id: img.id,
      dataUrl: img.imageData
        ? `data:${img.mimeType};base64,${img.imageData}`
        : `/api/presets/${p.id}/thumbnail?imgId=${img.id}`,
    })),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, images } = body as {
      name: string;
      images: { base64: string; mimeType: string }[];
    };

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "캐릭터 이름을 입력해주세요." },
        { status: 400 }
      );
    }
    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: "최소 1장의 이미지가 필요합니다." },
        { status: 400 }
      );
    }
    if (images.length > 4) {
      return NextResponse.json(
        { error: "최대 4장까지 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    const alias = `${name.trim()}_${Date.now()}`;

    const preset = await prisma.characterPreset.create({
      data: {
        alias,
        name: name.trim(),
        images: {
          create: images.map((img, i) => ({
            imageData: img.base64,
            mimeType: img.mimeType,
            order: i,
          })),
        },
      },
      include: {
        images: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({
      id: preset.id,
      alias: preset.alias,
      name: preset.name,
      images: preset.images.map((img) => ({
        id: img.id,
        dataUrl: `data:${img.mimeType};base64,${img.imageData}`,
      })),
    });
  } catch (error) {
    console.error("Preset creation error:", error);
    return NextResponse.json(
      { error: "프리셋 생성 실패" },
      { status: 500 }
    );
  }
}
