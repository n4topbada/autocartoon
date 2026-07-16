import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orderId = req.nextUrl.searchParams.get("order");
    if (orderId) {
      await prisma.creditPayment.updateMany({
        where: {
          id: orderId,
          userId: session.userId,
          status: { in: ["created", "ready"] },
        },
        data: { status: "failed", failureReason: "카카오페이 결제 실패" },
      });
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.redirect(new URL("/credits?payment=failed", req.url));
}
