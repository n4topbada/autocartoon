import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

const MAX_PRESETS = 30;

export async function GET() {
  try {
    const session = await requireAuth();
    const presets = await prisma.promptPreset.findMany({
      where: { userId: session.userId },
      orderBy: { usedAt: "desc" },
      take: MAX_PRESETS,
      select: { id: true, text: true, usedAt: true },
    });
    return NextResponse.json(presets);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프롬프트 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { text } = (await req.json()) as { text: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "프롬프트가 필요합니다." }, { status: 400 });
    }

    const trimmed = text.trim();

    // 동일 프롬프트 이미 존재하면 usedAt만 갱신
    const existing = await prisma.promptPreset.findFirst({
      where: { userId: session.userId, text: trimmed },
    });

    if (existing) {
      const updated = await prisma.promptPreset.update({
        where: { id: existing.id },
        data: { usedAt: new Date() },
      });
      return NextResponse.json({ id: updated.id, text: updated.text, usedAt: updated.usedAt });
    }

    // 새로 생성
    const count = await prisma.promptPreset.count({ where: { userId: session.userId } });

    // 최대 30개 초과 시 가장 오래된 것 삭제
    if (count >= MAX_PRESETS) {
      const oldest = await prisma.promptPreset.findFirst({
        where: { userId: session.userId },
        orderBy: { usedAt: "asc" },
      });
      if (oldest) {
        await prisma.promptPreset.delete({ where: { id: oldest.id } });
      }
    }

    const preset = await prisma.promptPreset.create({
      data: {
        userId: session.userId,
        text: trimmed,
      },
    });

    return NextResponse.json({ id: preset.id, text: preset.text, usedAt: preset.usedAt });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프롬프트 저장 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { id } = (await req.json()) as { id: string };

    const preset = await prisma.promptPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== session.userId) {
      return NextResponse.json({ error: "프롬프트를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.promptPreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "프롬프트 삭제 실패" }, { status: 500 });
  }
}
