import { NextRequest, NextResponse } from "next/server";
import { getCouponAvailability, normalizeCouponCode } from "@/lib/coupons";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    return NextResponse.json({ error: "쿠폰 코드를 확인해주세요.", code: "invalid" }, { status: 400 });
  }

  const campaign = await prisma.couponCampaign.findUnique({
    where: { code },
    select: {
      code: true,
      title: true,
      credits: true,
      active: true,
      startsAt: true,
      endsAt: true,
      maxRedemptions: true,
      redeemedCount: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "존재하지 않는 쿠폰입니다.", code: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    campaign: {
      code: campaign.code,
      title: campaign.title,
      credits: campaign.credits,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    },
    status: getCouponAvailability(campaign),
  }, { headers: { "Cache-Control": "no-store" } });
}
