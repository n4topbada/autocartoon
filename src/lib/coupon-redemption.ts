import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createCreditAuditEvent,
  createCreditLedgerWithAudit,
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "./credit-audit";
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
    public traceId?: string,
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
  let referenceId = `coupon-attempt:${userId}:${randomUUID()}`;
  let traceId = createCreditTraceId(referenceId);
  let auditCampaign: { id: string; credits: number; title: string } | null = null;
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "coupon_redeem",
      direction: "credit",
      status: "failure",
      source: "coupon",
      reasonCode: "COUPON_INVALID",
      summary: "쿠폰 코드 형식 오류",
      errorMessage: "쿠폰 코드를 확인해주세요.",
    });
    throw new CouponRedeemError("invalid", "쿠폰 코드를 확인해주세요.", 400, traceId);
  }

  const campaignIdentity = await prisma.couponCampaign.findUnique({
    where: { code },
    select: { id: true, credits: true, title: true },
  });
  if (!campaignIdentity) {
    await recordCreditAuditSafely({
      userId,
      traceId,
      referenceId,
      operation: "coupon_redeem",
      direction: "credit",
      status: "failure",
      source: "coupon",
      reasonCode: "COUPON_NOT_FOUND",
      summary: "존재하지 않는 쿠폰 등록 시도",
      errorMessage: "존재하지 않는 쿠폰입니다.",
    });
    throw new CouponRedeemError("not_found", "존재하지 않는 쿠폰입니다.", 404, traceId);
  }
  auditCampaign = campaignIdentity;
  referenceId = `coupon:${campaignIdentity.id}:${userId}`;
  traceId = createCreditTraceId(referenceId);

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
        await createCreditAuditEvent(tx, {
          userId,
          traceId,
          referenceId,
          operation: "coupon_redeem",
          direction: "neutral",
          status: "success",
          source: "coupon",
          units: existing.credits,
          balanceBefore: user.credits,
          balanceAfter: user.credits,
          reasonCode: "COUPON_ALREADY_REDEEMED",
          summary: "이미 지급된 쿠폰을 재확인",
          metadata: { campaignId: campaign.id, campaignTitle: campaign.title, idempotent: true },
        });
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
          await createCreditAuditEvent(tx, {
            userId,
            traceId,
            referenceId,
            operation: "coupon_redeem",
            direction: "neutral",
            status: "success",
            source: "coupon",
            units: concurrentRedemption.credits,
            balanceBefore: user.credits,
            balanceAfter: user.credits,
            reasonCode: "COUPON_CONCURRENT_REPLAY",
            summary: "동시에 처리된 쿠폰 지급을 재확인",
            metadata: { campaignId: campaign.id, campaignTitle: campaign.title, idempotent: true },
          });
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
      await createCreditLedgerWithAudit(tx, {
        userId,
        referenceKey: `${referenceId}:grant`,
        referenceId,
        traceId,
        action: "grant",
        source: "coupon",
        units: campaign.credits,
        balanceBefore: user.credits - campaign.credits,
        balanceAfter: user.credits,
        note: `쿠폰 지급: ${campaign.title}`,
        reasonCode: "COUPON_REDEEMED",
        metadata: { campaignId: campaign.id, campaignTitle: campaign.title },
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.couponRedemption.findUnique({
        where: { campaignId_userId: { campaignId: campaignIdentity.id, userId } },
        include: { campaign: { select: { id: true, code: true, title: true } }, user: { select: { credits: true } } },
      });
      if (existing) {
        await recordCreditAuditSafely({
          userId,
          traceId,
          referenceId,
          operation: "coupon_redeem",
          direction: "neutral",
          status: "success",
          source: "coupon",
          units: existing.credits,
          balanceBefore: existing.user.credits,
          balanceAfter: existing.user.credits,
          reasonCode: "COUPON_CONCURRENT_REPLAY",
          summary: "동시에 완료된 쿠폰 지급을 재확인",
          metadata: { campaignId: existing.campaign.id, campaignTitle: existing.campaign.title, idempotent: true },
        });
        return {
          status: "already_redeemed",
          credits: existing.credits,
          balance: existing.user.credits,
          redeemedAt: existing.redeemedAt,
          campaign: existing.campaign,
        };
      }
    }
    const safe = sanitizeCreditAuditError(error);
    if (error instanceof CouponRedeemError && !error.traceId) error.traceId = traceId;
    const wallet = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }).catch(() => null);
    await recordCreditAuditSafely({
      userId: wallet ? userId : null,
      traceId,
      referenceId,
      operation: "coupon_redeem",
      direction: "credit",
      status: "failure",
      source: "coupon",
      units: auditCampaign?.credits || 0,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: error instanceof CouponRedeemError
        ? `COUPON_${error.code.toUpperCase()}`
        : safe.reasonCode,
      summary: "쿠폰 크레딧 지급 실패",
      errorMessage: error instanceof Error ? error.message : safe.message,
      metadata: auditCampaign
        ? { campaignId: auditCampaign.id, campaignTitle: auditCampaign.title }
        : undefined,
    });
    throw error;
  }
}
