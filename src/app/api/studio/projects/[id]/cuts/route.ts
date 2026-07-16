import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: projectId } = await params;
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true, _count: { select: { cuts: true } } },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    if (project._count.cuts >= 30) {
      return NextResponse.json({ error: "프로젝트에는 최대 30개 컷을 만들 수 있습니다." }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const last = await prisma.projectCut.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;
    const cut = await prisma.projectCut.create({
      data: {
        projectId,
        order,
        title: body.title?.trim().slice(0, 80) || `컷 ${order + 1}`,
      },
    });
    return NextResponse.json({ cut }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Cut create error:", error);
    return NextResponse.json({ error: "컷을 추가하지 못했습니다." }, { status: 500 });
  }
}
