import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COMPLETED_STATUSES = ["succeeded", "failed"];

export async function GET() {
  try {
    const session = await requireAuth();
    const where = {
      userId: session.userId,
      status: { in: COMPLETED_STATUSES },
      completedAt: { not: null },
    };
    const [notifications, unreadCount] = await Promise.all([
      prisma.generationJob.findMany({
        where,
        orderBy: { completedAt: "desc" },
        take: 30,
        select: {
          id: true,
          kind: true,
          status: true,
          error: true,
          completedAt: true,
          notifiedAt: true,
          projectId: true,
          cutId: true,
          project: { select: { title: true } },
          cut: { select: { title: true } },
          artifacts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { thumbnailUrl: true, blobUrl: true, kind: true },
          },
        },
      }),
      prisma.generationJob.count({ where: { ...where, notifiedAt: null } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Notification list error:", error);
    return NextResponse.json({ error: "작업 알림을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => null)) as { all?: unknown; ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && id.length <= 128).slice(0, 100)
      : [];
    if (body?.all !== true && ids.length === 0) {
      return NextResponse.json({ error: "읽음 처리할 알림이 없습니다." }, { status: 400 });
    }
    const result = await prisma.generationJob.updateMany({
      where: {
        userId: session.userId,
        status: { in: COMPLETED_STATUSES },
        notifiedAt: null,
        ...(body?.all === true ? {} : { id: { in: ids } }),
      },
      data: { notifiedAt: new Date() },
    });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Notification update error:", error);
    return NextResponse.json({ error: "작업 알림을 읽음 처리하지 못했습니다." }, { status: 500 });
  }
}
