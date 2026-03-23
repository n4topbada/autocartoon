import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 모든 지식 목록
export async function GET() {
  try {
    await requireAdmin();
    const items = await prisma.chatKnowledge.findMany({
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "오류 발생" }, { status: 500 });
  }
}

// POST: 지식 추가
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { category, title, content } = await req.json();

    if (!category || !title || !content) {
      return NextResponse.json({ error: "category, title, content 필수" }, { status: 400 });
    }

    const item = await prisma.chatKnowledge.create({
      data: { category, title, content },
    });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "오류 발생" }, { status: 500 });
  }
}

// PATCH: 지식 수정
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const { id, category, title, content } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id 필수" }, { status: 400 });
    }

    const item = await prisma.chatKnowledge.update({
      where: { id },
      data: {
        ...(category && { category }),
        ...(title && { title }),
        ...(content && { content }),
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "오류 발생" }, { status: 500 });
  }
}

// DELETE: 지식 삭제
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id 필수" }, { status: 400 });
    }

    await prisma.chatKnowledge.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "오류 발생" }, { status: 500 });
  }
}
