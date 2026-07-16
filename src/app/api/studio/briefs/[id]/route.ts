import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : undefined;
    const content = typeof body.content === "string" ? body.content.trim() : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "기획서 제목을 입력해주세요." }, { status: 400 });
    }
    if (content !== undefined && (!content || content.length > MAX_CONTENT_LENGTH)) {
      return NextResponse.json({ error: "기획서는 1자 이상 20,000자 이하로 입력해주세요." }, { status: 400 });
    }
    if (title === undefined && content === undefined) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const result = await prisma.savedProjectBrief.updateMany({
      where: { id, userId: session.userId },
      data: { ...(title !== undefined ? { title } : {}), ...(content !== undefined ? { content } : {}) },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "기획서를 찾을 수 없습니다." }, { status: 404 });
    }
    const brief = await prisma.savedProjectBrief.findUnique({ where: { id } });
    return NextResponse.json({ brief });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Saved brief update error:", error);
    return NextResponse.json({ error: "기획서를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await prisma.savedProjectBrief.deleteMany({
      where: { id, userId: session.userId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "기획서를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Saved brief delete error:", error);
    return NextResponse.json({ error: "기획서를 삭제하지 못했습니다." }, { status: 500 });
  }
}
