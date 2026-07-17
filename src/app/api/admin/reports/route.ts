import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = new Set(["open", "reviewed", "dismissed"]);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const status = req.nextUrl.searchParams.get("status") || "open";
    const reports = await prisma.report.findMany({
      where: STATUSES.has(status) ? { status } : { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        reporter: { select: { id: true, email: true } },
        post: { select: { id: true, title: true } },
        comment: { select: { id: true, content: true, postId: true } },
      },
    });
    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "신고 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !STATUSES.has(status)) {
      return NextResponse.json({ error: "유효한 신고 id와 상태가 필요합니다." }, { status: 400 });
    }
    const updated = await prisma.report.updateMany({ where: { id }, data: { status } });
    if (updated.count === 0) {
      return NextResponse.json({ error: "신고를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "신고 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}
