import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    // 관리자는 ?userId= 로 다른 유저 데이터 조회 가능
    let targetUserId = session.userId;
    if (session.role === "admin" && searchParams.get("userId")) {
      targetUserId = searchParams.get("userId")!;
    }

    const presets = await prisma.characterPreset.findMany({
      where: { userId: targetUserId },
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
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프리셋 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
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
        userId: session.userId,
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Preset creation error:", error);
    return NextResponse.json(
      { error: "프리셋 생성 실패" },
      { status: 500 }
    );
  }
}
