import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (body.tier !== undefined) {
      if (!["free", "basic", "pro", "enterprise"].includes(body.tier)) {
        return NextResponse.json({ error: "유효하지 않은 티어" }, { status: 400 });
      }
      updateData.tier = body.tier;
    }

    if (body.addCredits !== undefined) {
      const amount = Number(body.addCredits);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: "유효하지 않은 크레딧 수량" }, { status: 400 });
      }
      updateData.credits = { increment: amount };
    }

    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        credits: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
  }
}
