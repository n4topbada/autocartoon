import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// POST: 타임아웃으로 인한 크레딧 환불 (1회)
export async function POST() {
  try {
    const session = await requireAuth();

    // 크레딧 1 환불 + 티어 사용량 1 차감
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        credits: { increment: 1 },
        tierUsedThisMonth: { decrement: 1 },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "환불 실패" }, { status: 500 });
  }
}
