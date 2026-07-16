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
        data: { status: "cancelled", failureReason: "사용자 결제 취소" },
      });
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.redirect(new URL("/credits?payment=cancelled", req.url));
}
