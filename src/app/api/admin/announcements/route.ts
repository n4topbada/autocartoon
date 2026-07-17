import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { parseAnnouncementInput } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const announcements = await prisma.announcement.findMany({
      orderBy: [{ published: "desc" }, { pinned: "desc" }, { updatedAt: "desc" }],
      include: { _count: { select: { reads: true } } },
    });
    return NextResponse.json(announcements);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin announcement list error:", error);
    return NextResponse.json({ error: "공지 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const parsed = parseAnnouncementInput(await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const announcement = await prisma.announcement.create({
      data: {
        ...parsed.value,
        publishedAt: parsed.value.published ? new Date() : null,
      },
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin announcement create error:", error);
    return NextResponse.json({ error: "공지를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "공지 ID가 필요합니다." }, { status: 400 });

    const parsed = parseAnnouncementInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const existing = await prisma.announcement.findUnique({ where: { id }, select: { published: true, publishedAt: true } });
    if (!existing) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...parsed.value,
        publishedAt: parsed.value.published
          ? existing.published ? existing.publishedAt || new Date() : new Date()
          : null,
      },
    });
    return NextResponse.json(announcement);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin announcement update error:", error);
    return NextResponse.json({ error: "공지를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "공지 ID가 필요합니다." }, { status: 400 });
    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin announcement delete error:", error);
    return NextResponse.json({ error: "공지를 삭제하지 못했습니다." }, { status: 500 });
  }
}
