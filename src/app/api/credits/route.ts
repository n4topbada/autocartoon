import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  CREDIT_COST_ROWS,
  CREDIT_PRODUCTS,
  WELCOME_CREDITS,
} from "@/lib/credit-products";
import { isKakaoPayConfigured, isKakaoPayTestMode } from "@/lib/kakaopay";
import { prisma } from "@/lib/prisma";
import {
  finalizeApprovedCreditPayment,
  reconcileKakaoPayCreditPayment,
} from "@/lib/credit-payments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireAuth();
    const pendingPayments = await prisma.creditPayment.findMany({
      where: { userId: session.userId, status: { in: ["approved", "approving"] } },
      select: { id: true, status: true },
      take: 10,
    });
    await Promise.all(pendingPayments.map(async (payment) => {
      const finalize = payment.status === "approved"
        ? finalizeApprovedCreditPayment
        : reconcileKakaoPayCreditPayment;
      await finalize(payment.id, session.userId).catch((error) => {
        console.error("Deferred credit payment finalization failed:", error);
      });
    }));
    const [user, ledger, payments] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { credits: true, welcomeCreditsGrantedAt: true },
      }),
      prisma.creditLedger.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          action: true,
          source: true,
          units: true,
          balanceAfter: true,
          note: true,
          createdAt: true,
        },
      }),
      prisma.creditPayment.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          productCode: true,
          credits: true,
          amountKrw: true,
          status: true,
          approvedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      balance: user.credits,
      welcomeCredits: WELCOME_CREDITS,
      welcomeGranted: Boolean(user.welcomeCreditsGrantedAt),
      products: CREDIT_PRODUCTS,
      costs: CREDIT_COST_ROWS,
      provider: {
        name: "카카오페이",
        configured: isKakaoPayConfigured(),
        testMode: isKakaoPayTestMode(),
      },
      ledger,
      payments,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Credit wallet error:", error);
    return NextResponse.json({ error: "크레딧 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
