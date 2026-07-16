import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { deleteBlobIfUnreferenced } from "@/lib/blob-references";
import { prisma } from "@/lib/prisma";

const ASPECT_SIZES: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "3:4": { width: 960, height: 1280 },
  "8:11": { width: 800, height: 1100 },
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
        coverCut: true,
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
    let coverCutId: string | null | undefined;
    if (body.coverCutId === null) {
      coverCutId = null;
    } else if (typeof body.coverCutId === "string") {
      const cover = await prisma.projectCut.findFirst({
        where: { id: body.coverCutId, projectId: id },
        select: { id: true },
      });
      if (!cover) return NextResponse.json({ error: "표지 컷을 찾을 수 없습니다." }, { status: 404 });
      coverCutId = cover.id;
    }
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
        ...(coverCutId !== undefined ? { coverCutId } : {}),
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
    const project = await prisma.creativeProject.findFirst({
      where: { id, userId: session.userId },
      select: {
        id: true,
        cuts: { select: { imageUrl: true, thumbnailUrl: true, videoUrl: true } },
        assets: { select: { blobUrl: true, thumbnailUrl: true } },
      },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const blobUrls = Array.from(new Set([
      ...project.cuts.flatMap((cut) => [cut.imageUrl, cut.thumbnailUrl, cut.videoUrl]),
      ...project.assets.flatMap((asset) => [asset.blobUrl, asset.thumbnailUrl]),
    ].filter((url): url is string => Boolean(url))));

    await prisma.creativeProject.delete({ where: { id: project.id } });
    const cleanup = await Promise.allSettled(
      blobUrls.map((url) => deleteBlobIfUnreferenced(url))
    );
    const failedCleanup = cleanup.filter((result) => result.status === "rejected");
    if (failedCleanup.length > 0) {
      console.error(`Project ${id} deleted with ${failedCleanup.length} Blob cleanup failures.`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프로젝트를 삭제하지 못했습니다." }, { status: 500 });
  }
}
