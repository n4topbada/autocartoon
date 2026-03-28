import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await req.json()) as { name?: string; order?: number };

    const group = await prisma.characterGroup.findUnique({ where: { id } });
    if (!group || group.userId !== session.userId) {
      return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.characterGroup.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.order !== undefined && { order: body.order }),
      },
    });

    return NextResponse.json({ id: updated.id, name: updated.name, order: updated.order });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "그룹 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const group = await prisma.characterGroup.findUnique({ where: { id } });
    if (!group || group.userId !== session.userId) {
      return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
    }

    // 그룹 내 프리셋을 orphan (ungrouped)으로 변경
    await prisma.characterPreset.updateMany({
      where: { groupId: id },
      data: { groupId: null },
    });

    await prisma.characterGroup.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "그룹 삭제 실패" }, { status: 500 });
  }
}
