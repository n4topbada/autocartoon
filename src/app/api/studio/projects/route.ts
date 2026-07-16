import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ASPECT_SIZES: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export async function GET() {
  try {
    const session = await requireAuth();
    const projects = await prisma.creativeProject.findMany({
      where: { userId: session.userId },
      include: {
        cuts: { orderBy: { order: "asc" }, take: 1 },
        _count: { select: { cuts: true, assets: true, jobs: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      aspectRatio?: string;
    };
    const title = body.title?.trim().slice(0, 120) || "새 웹툰 프로젝트";
    const aspectRatio = body.aspectRatio && ASPECT_SIZES[body.aspectRatio]
      ? body.aspectRatio
      : "9:16";
    const size = ASPECT_SIZES[aspectRatio];
    const project = await prisma.creativeProject.create({
      data: {
        userId: session.userId,
        title,
        description: body.description?.trim().slice(0, 2_000),
        aspectRatio,
        canvasWidth: size.width,
        canvasHeight: size.height,
        cuts: { create: { order: 0, title: "컷 1" } },
      },
      include: { cuts: true, assets: true },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Project create error:", error);
    return NextResponse.json({ error: "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}
