import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  createCreditTraceId,
  recordCreditAuditSafely,
  sanitizeCreditAuditError,
} from "@/lib/credit-audit";
import { getCreditProduct, getProductTotalCredits } from "@/lib/credit-products";
import { isKakaoPayConfigured, KakaoPayError, readyKakaoPay } from "@/lib/kakaopay";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let paymentId: string | undefined;
  let auditContext: {
    userId: string;
    referenceId: string;
    traceId: string;
    units: number;
    amountKrw?: number;
    productCode?: string;
  } | null = null;
  try {
    const session = await requireAuth();
    const attemptReference = `payment-attempt:${session.userId}:${randomUUID()}`;
    auditContext = {
      userId: session.userId,
      referenceId: attemptReference,
      traceId: createCreditTraceId(attemptReference),
      units: 0,
    };
    if (!isKakaoPayConfigured()) {
      await recordCreditAuditSafely({
        userId: session.userId,
        traceId: auditContext.traceId,
        referenceId: auditContext.referenceId,
        operation: "payment_ready",
        direction: "credit",
        status: "failure",
        source: "kakaopay",
        reasonCode: "PAYMENT_PROVIDER_NOT_CONFIGURED",
        summary: "결제 시작 실패",
        errorMessage: "카카오페이 운영 설정이 완료되지 않았습니다.",
      });
      return NextResponse.json(
        {
          error: "카카오페이 운영 설정이 아직 완료되지 않았습니다.",
          traceId: auditContext.traceId,
        },
        { status: 503 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as { productCode?: unknown };
    const productCode = typeof body.productCode === "string" ? body.productCode : "";
    const product = getCreditProduct(productCode);
    if (!product) {
      await recordCreditAuditSafely({
        userId: session.userId,
        traceId: auditContext.traceId,
        referenceId: auditContext.referenceId,
        operation: "payment_ready",
        direction: "credit",
        status: "failure",
        source: "kakaopay",
        reasonCode: "INVALID_CREDIT_PRODUCT",
        summary: "유효하지 않은 상품으로 결제 시도",
        errorMessage: "유효하지 않은 크레딧 상품입니다.",
      });
      return NextResponse.json(
        { error: "유효하지 않은 크레딧 상품입니다.", traceId: auditContext.traceId },
        { status: 400 }
      );
    }

    // 보너스 크레딧까지 포함한 총 적립량을 결제 레코드에 저장해 승인 시 전액 적립되게 한다.
    const totalCredits = getProductTotalCredits(product);
    const partnerOrderId = `wony_${randomUUID().replaceAll("-", "")}`;
    const payment = await prisma.creditPayment.create({
      data: {
        userId: session.userId,
        productCode: product.code,
        credits: totalCredits,
        amountKrw: product.amountKrw,
        partnerOrderId,
      },
    });
    paymentId = payment.id;
    const referenceId = `payment:${payment.id}`;
    auditContext = {
      userId: session.userId,
      referenceId,
      traceId: createCreditTraceId(referenceId),
      units: totalCredits,
      amountKrw: product.amountKrw,
      productCode: product.code,
    };

    const origin = getAppOrigin(req.nextUrl.origin);
    const orderParam = encodeURIComponent(payment.id);
    const ready = await readyKakaoPay({
      partnerOrderId,
      partnerUserId: session.userId,
      itemName: `WONY ${product.name} ${totalCredits} 크레딧`,
      itemCode: product.code,
      amountKrw: product.amountKrw,
      approvalUrl: `${origin}/api/payments/kakao/approve?order=${orderParam}`,
      cancelUrl: `${origin}/api/payments/kakao/cancel?order=${orderParam}`,
      failUrl: `${origin}/api/payments/kakao/fail?order=${orderParam}`,
    });

    await prisma.creditPayment.update({
      where: { id: payment.id },
      data: { status: "ready", providerTid: ready.tid },
    });
    const wallet = await prisma.user.findUnique({ where: { id: session.userId }, select: { credits: true } });
    await recordCreditAuditSafely({
      userId: session.userId,
      traceId: auditContext.traceId,
      referenceId: auditContext.referenceId,
      operation: "payment_ready",
      direction: "neutral",
      status: "success",
      source: "kakaopay",
      units: totalCredits,
      balanceBefore: wallet?.credits,
      balanceAfter: wallet?.credits,
      reasonCode: "PAYMENT_READY",
      summary: "카카오페이 결제창 생성 완료",
      metadata: {
        paymentId: payment.id,
        paymentStatus: "ready",
        productCode: product.code,
        amountKrw: product.amountKrw,
      },
    });
    return NextResponse.json({
      paymentId: payment.id,
      traceId: auditContext.traceId,
      redirectUrl: ready.next_redirect_pc_url,
      mobileRedirectUrl: ready.next_redirect_mobile_url,
      appRedirectUrl: ready.next_redirect_app_url,
    });
  } catch (error) {
    if (paymentId) {
      await prisma.creditPayment
        .update({
          where: { id: paymentId },
          data: {
            status: "failed",
            failureReason: error instanceof Error ? error.message.slice(0, 1_000) : "ready failed",
          },
        })
        .catch(() => undefined);
    }
    if (auditContext) {
      const safe = sanitizeCreditAuditError(error);
      const wallet = await prisma.user.findUnique({
        where: { id: auditContext.userId },
        select: { credits: true },
      }).catch(() => null);
      await recordCreditAuditSafely({
        userId: wallet ? auditContext.userId : null,
        traceId: auditContext.traceId,
        referenceId: auditContext.referenceId,
        operation: "payment_ready",
        direction: "credit",
        status: "failure",
        source: "kakaopay",
        units: auditContext.units,
        balanceBefore: wallet?.credits,
        balanceAfter: wallet?.credits,
        reasonCode: safe.reasonCode,
        summary: "카카오페이 결제 시작 오류",
        errorMessage: safe.message,
        metadata: {
          paymentId,
          productCode: auditContext.productCode,
          amountKrw: auditContext.amountKrw,
        },
      });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof KakaoPayError) {
      return NextResponse.json(
        { error: error.message, traceId: auditContext?.traceId },
        { status: 503 }
      );
    }
    console.error("KakaoPay ready error:", error);
    return NextResponse.json(
      { error: "결제를 시작하지 못했습니다.", traceId: auditContext?.traceId },
      { status: 500 }
    );
  }
}
