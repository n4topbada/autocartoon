import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const tag = await prisma.imageTag.findUnique({ where: { id } });
    if (!tag || tag.userId !== session.userId) {
      return NextResponse.json({ error: "태그를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.imageTag.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "태그 삭제 실패" }, { status: 500 });
  }
}
