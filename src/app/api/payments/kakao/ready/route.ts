import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getCreditProduct } from "@/lib/credit-products";
import { isKakaoPayConfigured, KakaoPayError, readyKakaoPay } from "@/lib/kakaopay";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getCallbackOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (process.env.NODE_ENV === "production" && configured && !configured.includes("localhost")) {
    return configured.replace(/\/$/, "");
  }
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  let paymentId: string | undefined;
  try {
    const session = await requireAuth();
    if (!isKakaoPayConfigured()) {
      return NextResponse.json(
        { error: "카카오페이 운영 설정이 아직 완료되지 않았습니다." },
        { status: 503 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as { productCode?: unknown };
    const productCode = typeof body.productCode === "string" ? body.productCode : "";
    const product = getCreditProduct(productCode);
    if (!product) {
      return NextResponse.json({ error: "유효하지 않은 크레딧 상품입니다." }, { status: 400 });
    }

    const partnerOrderId = `wony_${randomUUID().replaceAll("-", "")}`;
    const payment = await prisma.creditPayment.create({
      data: {
        userId: session.userId,
        productCode: product.code,
        credits: product.credits,
        amountKrw: product.amountKrw,
        partnerOrderId,
      },
    });
    paymentId = payment.id;

    const origin = getCallbackOrigin(req);
    const orderParam = encodeURIComponent(payment.id);
    const ready = await readyKakaoPay({
      partnerOrderId,
      partnerUserId: session.userId,
      itemName: `WONY ${product.name} ${product.credits} 크레딧`,
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
    return NextResponse.json({
      paymentId: payment.id,
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof KakaoPayError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("KakaoPay ready error:", error);
    return NextResponse.json({ error: "결제를 시작하지 못했습니다." }, { status: 500 });
  }
}
