import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const tags = await prisma.imageTag.findMany({
      where: { userId: session.userId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "태그 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { name, color } = (await req.json()) as { name: string; color?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "태그 이름을 입력해주세요." }, { status: 400 });
    }

    const tag = await prisma.imageTag.create({
      data: {
        userId: session.userId,
        name: name.trim(),
        color: color || "#3b82f6",
      },
    });

    return NextResponse.json({ id: tag.id, name: tag.name, color: tag.color });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // unique constraint violation
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "이미 존재하는 태그입니다." }, { status: 400 });
    }
    return NextResponse.json({ error: "태그 생성 실패" }, { status: 500 });
  }
}
