import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { parseAnnouncementLimit } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

function activeAnnouncementWhere(now: Date): Prisma.AnnouncementWhereInput {
  return {
    published: true,
    AND: [
      { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const limit = parseAnnouncementLimit(new URL(req.url).searchParams.get("limit"));
    const where = activeAnnouncementWhere(new Date());

    const [announcements, unreadCount] = await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          pinned: true,
          publishedAt: true,
          expiresAt: true,
          reads: {
            where: { userId: session.userId },
            select: { readAt: true },
            take: 1,
          },
        },
      }),
      prisma.announcement.count({
        where: { ...where, reads: { none: { userId: session.userId } } },
      }),
    ]);

    return NextResponse.json({
      announcements: announcements.map(({ reads, ...announcement }) => ({
        ...announcement,
        readAt: reads[0]?.readAt || null,
        isRead: reads.length > 0,
      })),
      unreadCount,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Announcement list error:", error);
    return NextResponse.json({ error: "공지를 불러오지 못했습니다." }, { status: 500 });
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
      return NextResponse.json({ error: "읽음 처리할 공지가 없습니다." }, { status: 400 });
    }

    const active = activeAnnouncementWhere(new Date());
    const visible = await prisma.announcement.findMany({
      where: { ...active, ...(body?.all === true ? {} : { id: { in: ids } }) },
      select: { id: true },
    });
    const result = visible.length > 0
      ? await prisma.announcementRead.createMany({
          data: visible.map(({ id }) => ({ announcementId: id, userId: session.userId })),
          skipDuplicates: true,
        })
      : { count: 0 };

    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Announcement read error:", error);
    return NextResponse.json({ error: "공지를 읽음 처리하지 못했습니다." }, { status: 500 });
  }
}
