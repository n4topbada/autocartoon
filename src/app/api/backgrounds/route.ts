import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  const backgrounds = await prisma.savedBackground.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    backgrounds.map((bg) => ({
      id: bg.id,
      name: bg.name,
      mimeType: bg.mimeType,
      dataUrl: `data:${bg.mimeType};base64,${bg.imageData}`,
      createdAt: bg.createdAt.toISOString(),
    }))
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
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

    const bg = await prisma.savedBackground.create({
      data: {
        name: name.trim(),
        imageData,
        mimeType: mimeType || "image/png",
      },
    });

    return NextResponse.json({
      id: bg.id,
      name: bg.name,
      mimeType: bg.mimeType,
      dataUrl: `data:${bg.mimeType};base64,${bg.imageData}`,
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
