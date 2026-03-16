import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { presetId } = await req.json();

    if (!presetId) {
      return NextResponse.json({ error: "presetId가 필요합니다." }, { status: 400 });
    }

    // 프리셋 조회
    const preset = await prisma.characterPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset || preset.userId !== null) {
      return NextResponse.json({ error: "마켓플레이스 프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    // 이미 구매했는지 확인
    const existing = await prisma.purchasedPreset.findUnique({
      where: { userId_presetId: { userId: session.userId, presetId } },
    });

    if (existing) {
      return NextResponse.json({ error: "이미 보유한 캐릭터입니다." }, { status: 400 });
    }

    // 크레딧 확인
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });

    if (preset.price > 0 && user.credits < preset.price) {
      return NextResponse.json(
        { error: `바나나가 부족합니다. (필요: ${preset.price}, 보유: ${user.credits})` },
        { status: 400 }
      );
    }

    // 트랜잭션: 크레딧 차감 + 구매 기록
    await prisma.$transaction([
      ...(preset.price > 0
        ? [
            prisma.user.update({
              where: { id: session.userId },
              data: { credits: { decrement: preset.price } },
            }),
          ]
        : []),
      prisma.purchasedPreset.create({
        data: { userId: session.userId, presetId },
      }),
    ]);

    return NextResponse.json({ ok: true, remainingCredits: user.credits - preset.price });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Purchase error:", error);
    return NextResponse.json({ error: "구매 실패" }, { status: 500 });
  }
}
