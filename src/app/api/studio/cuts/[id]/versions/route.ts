import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const cut = await prisma.projectCut.findFirst({
      where: { id, project: { userId: session.userId } },
      select: { id: true },
    });
    if (!cut) return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });

    const versions = await prisma.canvasVersion.findMany({
      where: { cutId: id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        imageUrl: true,
        thumbnailUrl: true,
        source: true,
        label: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ versions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Canvas versions read error:", error);
    return NextResponse.json({ error: "편집 히스토리를 불러오지 못했습니다." }, { status: 500 });
  }
}
