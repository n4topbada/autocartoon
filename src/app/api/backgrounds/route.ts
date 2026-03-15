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

    const backgrounds = await prisma.savedBackground.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      backgrounds.map((bg) => ({
        id: bg.id,
        name: bg.name,
        mimeType: bg.mimeType,
        dataUrl: bg.blobUrl,
        createdAt: bg.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "배경 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { name, imageData, mimeType } = (await req.json()) as {
      name: string;
      imageData: string;
      mimeType?: string;
    };

    if (!name?.trim() || !imageData) {
      return NextResponse.json(
        { error: "name과 imageData는 필수입니다." },
        { status: 400 }
      );
    }

    const mime = mimeType || "image/png";
    const blobUrl = await uploadBase64ToBlob(imageData, mime, "backgrounds");

    const bg = await prisma.savedBackground.create({
      data: {
        name: name.trim(),
        blobUrl,
        mimeType: mime,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      id: bg.id,
      name: bg.name,
      mimeType: bg.mimeType,
      dataUrl: bg.blobUrl,
      createdAt: bg.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Save background error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 }
    );
  }
}
