import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  COUPON_STATUS_MESSAGES,
  getCouponAvailability,
  normalizeCouponCode,
  type CouponAvailability,
} from "./coupons";

export type CouponRedemptionResult = {
  status: "redeemed" | "already_redeemed";
  credits: number;
  balance: number;
  redeemedAt: Date;
  campaign: { id: string; code: string; title: string };
};

export class CouponRedeemError extends Error {
  constructor(
    public readonly code: "invalid" | "not_found" | Exclude<CouponAvailability, "available">,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CouponRedeemError";
  }
}

function availabilityError(status: Exclude<CouponAvailability, "available">) {
  return new CouponRedeemError(
    status,
    COUPON_STATUS_MESSAGES[status],
    status === "expired" || status === "inactive" ? 410 : 409,
  );
}

export async function redeemCoupon(userId: string, rawCode: unknown): Promise<CouponRedemptionResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) throw new CouponRedeemError("invalid", "쿠폰 코드를 확인해주세요.", 400);

  const campaignIdentity = await prisma.couponCampaign.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!campaignIdentity) {
    throw new CouponRedeemError("not_found", "존재하지 않는 쿠폰입니다.", 404);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const campaign = await tx.couponCampaign.findUnique({
        where: { id: campaignIdentity.id },
      });
      if (!campaign) throw new CouponRedeemError("not_found", "존재하지 않는 쿠폰입니다.", 404);

      const existing = await tx.couponRedemption.findUnique({
        where: { campaignId_userId: { campaignId: campaign.id, userId } },
      });
      if (existing) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
        return {
          status: "already_redeemed" as const,
          credits: existing.credits,
          balance: user.credits,
          redeemedAt: existing.redeemedAt,
          campaign: { id: campaign.id, code: campaign.code, title: campaign.title },
        };
      }

      const now = new Date();
      const availability = getCouponAvailability(campaign, now);
      if (availability !== "available") throw availabilityError(availability);

      const validityFilters: Prisma.CouponCampaignWhereInput[] = [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ];
      if (campaign.maxRedemptions !== null) {
        validityFilters.push({ redeemedCount: { lt: campaign.maxRedemptions } });
      }
      const reserved = await tx.couponCampaign.updateMany({
        where: { id: campaign.id, active: true, AND: validityFilters },
        data: { redeemedCount: { increment: 1 } },
      });
      if (reserved.count !== 1) {
        const concurrentRedemption = await tx.couponRedemption.findUnique({
          where: { campaignId_userId: { campaignId: campaign.id, userId } },
        });
        if (concurrentRedemption) {
          const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
          return {
            status: "already_redeemed" as const,
            credits: concurrentRedemption.credits,
            balance: user.credits,
            redeemedAt: concurrentRedemption.redeemedAt,
            campaign: { id: campaign.id, code: campaign.code, title: campaign.title },
          };
        }
        const latestCampaign = await tx.couponCampaign.findUnique({
          where: { id: campaign.id },
        });
        if (!latestCampaign) {
          throw new CouponRedeemError("not_found", "존재하지 않는 쿠폰입니다.", 404);
        }
        const latestAvailability = getCouponAvailability(latestCampaign, new Date());
        throw availabilityError(latestAvailability === "available" ? "exhausted" : latestAvailability);
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: campaign.credits } },
        select: { credits: true },
      });
      const redemption = await tx.couponRedemption.create({
        data: {
          campaignId: campaign.id,
          userId,
          credits: campaign.credits,
          balanceAfter: user.credits,
        },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          referenceKey: `coupon:${campaign.id}:${userId}:grant`,
          action: "grant",
          source: "coupon",
          units: campaign.credits,
          balanceAfter: user.credits,
          note: `쿠폰 지급: ${campaign.title}`,
        },
      });

      return {
        status: "redeemed" as const,
        credits: campaign.credits,
        balance: user.credits,
        redeemedAt: redemption.redeemedAt,
        campaign: { id: campaign.id, code: campaign.code, title: campaign.title },
      };
    });
  } catch (error) {
    if (error instanceof CouponRedeemError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.couponRedemption.findUnique({
        where: { campaignId_userId: { campaignId: campaignIdentity.id, userId } },
        include: { campaign: { select: { id: true, code: true, title: true } }, user: { select: { credits: true } } },
      });
      if (existing) {
        return {
          status: "already_redeemed",
          credits: existing.credits,
          balance: existing.user.credits,
          redeemedAt: existing.redeemedAt,
          campaign: existing.campaign,
        };
      }
    }
    throw error;
  }
}
