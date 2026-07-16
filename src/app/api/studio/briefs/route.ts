import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_BRIEFS = 50;
const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return (firstLine || `기획서 ${new Date().toLocaleDateString("ko-KR")}`).slice(0, MAX_TITLE_LENGTH);
}

export async function GET() {
  try {
    const session = await requireAuth();
    const briefs = await prisma.savedProjectBrief.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      take: MAX_BRIEFS,
    });
    return NextResponse.json({ briefs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Saved brief list error:", error);
    return NextResponse.json({ error: "저장된 기획서를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body) || typeof body.content !== "string") {
      return NextResponse.json({ error: "기획서 내용이 필요합니다." }, { status: 400 });
    }
    const content = body.content.trim();
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "기획서는 1자 이상 20,000자 이하로 입력해주세요." }, { status: 400 });
    }
    const requestedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const title = (requestedTitle || defaultTitle(content)).slice(0, MAX_TITLE_LENGTH);

    const count = await prisma.savedProjectBrief.count({ where: { userId: session.userId } });
    if (count >= MAX_BRIEFS) {
      return NextResponse.json({ error: `저장된 기획서는 최대 ${MAX_BRIEFS}개까지 보관할 수 있습니다.` }, { status: 409 });
    }

    const brief = await prisma.savedProjectBrief.create({
      data: { userId: session.userId, title, content },
    });
    return NextResponse.json({ brief }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Saved brief create error:", error);
    return NextResponse.json({ error: "기획서를 저장하지 못했습니다." }, { status: 500 });
  }
}
