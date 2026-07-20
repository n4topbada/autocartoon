import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { AuthError, requireAdmin } from "@/lib/auth";
import {
  COUPON_CREDITS,
  generateCouponCode,
  parseCouponCampaignInput,
} from "@/lib/coupons";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const adminCouponInclude = {
  createdBy: { select: { email: true } },
  redemptions: {
    orderBy: { redeemedAt: "desc" as const },
    take: 5,
    select: {
      id: true,
      credits: true,
      balanceAfter: true,
      redeemedAt: true,
      user: { select: { email: true, name: true } },
    },
  },
} satisfies Prisma.CouponCampaignInclude;

type AdminCoupon = Prisma.CouponCampaignGetPayload<{ include: typeof adminCouponInclude }>;

function serializeCoupon(campaign: AdminCoupon, requestOrigin: string) {
  return {
    ...campaign,
    createdByEmail: campaign.createdBy?.email ?? null,
    createdBy: undefined,
    claimUrl: getAppUrl(`/coupon/${campaign.code}`, requestOrigin),
  };
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const campaigns = await prisma.couponCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: adminCouponInclude,
    });
    return NextResponse.json(campaigns.map((campaign) => serializeCoupon(campaign, req.nextUrl.origin)));
  } catch (error) {
    return errorResponse(error, "쿠폰 목록을 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = parseCouponCampaignInput(await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const campaign = await prisma.couponCampaign.create({
          data: {
            ...parsed.value,
            code: generateCouponCode(),
            credits: COUPON_CREDITS,
            createdById: admin.userId,
          },
          include: adminCouponInclude,
        });
        return NextResponse.json(serializeCoupon(campaign, req.nextUrl.origin), { status: 201 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    return NextResponse.json({ error: "쿠폰 코드를 만들지 못했습니다. 다시 시도해주세요." }, { status: 503 });
  } catch (error) {
    return errorResponse(error, "쿠폰을 만들지 못했습니다.");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "쿠폰 ID가 필요합니다." }, { status: 400 });

    const parsed = parseCouponCampaignInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const updated = await prisma.couponCampaign.updateMany({
      where: {
        id,
        ...(parsed.value.maxRedemptions === null
          ? {}
          : { redeemedCount: { lte: parsed.value.maxRedemptions } }),
      },
      data: parsed.value,
    });
    if (updated.count !== 1) {
      const exists = await prisma.couponCampaign.findUnique({ where: { id }, select: { id: true } });
      return exists
        ? NextResponse.json({ error: "최대 지급 인원은 현재 지급 인원보다 작을 수 없습니다." }, { status: 400 })
        : NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
    }

    const campaign = await prisma.couponCampaign.findUniqueOrThrow({
      where: { id },
      include: adminCouponInclude,
    });
    return NextResponse.json(serializeCoupon(campaign, req.nextUrl.origin));
  } catch (error) {
    return errorResponse(error, "쿠폰을 수정하지 못했습니다.");
  }
}
