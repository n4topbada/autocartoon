import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireAuth();
    const sessions = await prisma.userSession.findMany({
      where: { userId: session.userId, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        device: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    return NextResponse.json({
      sessions: sessions.map((item) => ({
        ...item,
        current: item.id === session.sessionId,
      })),
      limit: 2,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "기기 세션을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as { id?: unknown; others?: unknown };
    if (body.others === true) {
      await prisma.userSession.deleteMany({
        where: {
          userId: session.userId,
          ...(session.sessionId ? { id: { not: session.sessionId } } : {}),
        },
      });
      return NextResponse.json({ ok: true, currentRevoked: false });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    const deleted = await prisma.userSession.deleteMany({ where: { id, userId: session.userId } });
    if (!deleted.count) return NextResponse.json({ error: "기기 세션을 찾을 수 없습니다." }, { status: 404 });
    const currentRevoked = id === session.sessionId;
    if (currentRevoked) session.destroy();
    return NextResponse.json({ ok: true, currentRevoked });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "기기 세션을 해제하지 못했습니다." }, { status: 500 });
  }
}
