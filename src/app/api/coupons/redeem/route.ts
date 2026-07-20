import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { CouponRedeemError, redeemCoupon } from "@/lib/coupon-redemption";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => null) as { code?: unknown } | null;
    const result = await redeemCoupon(session.userId, body?.code);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: "auth_required" }, { status: error.status });
    }
    if (error instanceof CouponRedeemError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Coupon redemption error:", error);
    return NextResponse.json({ error: "쿠폰을 지급하지 못했습니다." }, { status: 500 });
  }
}
