import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { uploadBase64ToBlob } from "@/lib/blob";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    let targetUserId = session.userId;
    if (session.role === "admin" && searchParams.get("userId")) {
      targetUserId = searchParams.get("userId")!;
    }

    const presets = await prisma.characterPreset.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          { userId: null }, // 시스템 기본 프리셋
        ],
      },
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
        dataUrl: img.blobUrl,
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

    // Blob에 업로드
    const blobUrls = await Promise.all(
      images.map((img) => uploadBase64ToBlob(img.base64, img.mimeType, "presets"))
    );

    const alias = `${name.trim()}_${Date.now()}`;

    const preset = await prisma.characterPreset.create({
      data: {
        alias,
        name: name.trim(),
        userId: session.userId,
        images: {
          create: images.map((img, i) => ({
            blobUrl: blobUrls[i],
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
        dataUrl: img.blobUrl,
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
