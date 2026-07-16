import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ASPECT_SIZES: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const project = await prisma.creativeProject.findFirst({
      where: { id, userId: session.userId },
      include: {
        cuts: { orderBy: { order: "asc" } },
        assets: { orderBy: { createdAt: "desc" } },
        jobs: {
          include: { artifacts: { orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const existing = await prisma.creativeProject.findFirst({
      where: { id, userId: session.userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    const aspectRatio = typeof body.aspectRatio === "string" && ASPECT_SIZES[body.aspectRatio]
      ? body.aspectRatio
      : undefined;
    const project = await prisma.creativeProject.update({
      where: { id },
      data: {
        ...(typeof body.title === "string" && body.title.trim()
          ? { title: body.title.trim().slice(0, 120) }
          : {}),
        ...(typeof body.description === "string"
          ? { description: body.description.trim().slice(0, 2_000) }
          : {}),
        ...(typeof body.status === "string" ? { status: body.status.slice(0, 40) } : {}),
        ...(aspectRatio
          ? {
              aspectRatio,
              canvasWidth: ASPECT_SIZES[aspectRatio].width,
              canvasHeight: ASPECT_SIZES[aspectRatio].height,
            }
          : {}),
      },
    });
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프로젝트를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const deleted = await prisma.creativeProject.deleteMany({
      where: { id, userId: session.userId },
    });
    if (!deleted.count) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프로젝트를 삭제하지 못했습니다." }, { status: 500 });
  }
}
