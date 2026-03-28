import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function DELETE() {
  try {
    const session = await requireAuth();
    await prisma.instagramAccount.deleteMany({ where: { userId: session.userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "연동 해제 실패" }, { status: 500 });
  }
}
