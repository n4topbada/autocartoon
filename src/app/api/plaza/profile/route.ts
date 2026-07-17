import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 공개용 닉네임(실명·이메일과 분리)을 관리한다. 툰 광장 게시·댓글의 표시 이름으로 쓴다.
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9._-]{2,20}$/;

export async function GET() {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { plazaNickname: true },
    });
    return NextResponse.json({ nickname: user?.plazaNickname ?? null });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "닉네임을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as { nickname?: unknown };
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (!NICKNAME_PATTERN.test(nickname)) {
      return NextResponse.json(
        { error: "닉네임은 한글·영문·숫자·._- 를 사용해 2~20자로 입력해주세요." },
        { status: 400 }
      );
    }
    try {
      await prisma.user.update({
        where: { id: session.userId },
        data: { plazaNickname: nickname },
      });
    } catch (updateError) {
      if (updateError instanceof Prisma.PrismaClientKnownRequestError && updateError.code === "P2002") {
        return NextResponse.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 });
      }
      throw updateError;
    }
    return NextResponse.json({ nickname });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Plaza nickname error:", error);
    return NextResponse.json({ error: "닉네임을 저장하지 못했습니다." }, { status: 500 });
  }
}
