import { NextRequest, NextResponse } from "next/server";
import { hashAuthToken, isAuthTokenShape } from "@/lib/auth-tokens";
import { createCreditLedgerWithAudit } from "@/lib/credit-audit";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUserSession } from "@/lib/user-sessions";

function verifyRedirect(req: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/verify?error=${error}`, req.url));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!isAuthTokenShape(token)) return verifyRedirect(req, "invalid_token");

  const tokenHash = hashAuthToken(token);
  const candidates = [tokenHash, token];
  const user = await prisma.user.findFirst({
    where: { OR: candidates.map((value) => ({ verifyToken: value })) },
  });
  if (!user) return verifyRedirect(req, "invalid_token");

  const now = new Date();
  if (!user.verifyTokenExp || user.verifyTokenExp <= now) {
    await prisma.user.updateMany({
      where: { id: user.id, verifyToken: { in: candidates } },
      data: { verifyToken: null, verifyTokenExp: null },
    });
    return verifyRedirect(req, "token_expired");
  }

  const verified = await prisma.$transaction(async (tx) => {
    const welcomeReferenceKey = `welcome:${user.id}:grant`;
    const existingWelcome = await tx.creditLedger.findUnique({
      where: { referenceKey: welcomeReferenceKey },
      select: { id: true },
    });
    const grantWelcome = user.role !== "admin"
      && !user.welcomeCreditsGrantedAt
      && !existingWelcome;
    const claimed = await tx.user.updateMany({
      where: { id: user.id, verifyToken: { in: candidates } },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExp: null,
        ...(!user.welcomeCreditsGrantedAt ? { welcomeCreditsGrantedAt: now } : {}),
        ...(grantWelcome ? { credits: { increment: WELCOME_CREDITS } } : {}),
      },
    });
    if (claimed.count !== 1) return null;

    if (grantWelcome) {
      await createCreditLedgerWithAudit(tx, {
        userId: user.id,
        referenceKey: welcomeReferenceKey,
        referenceId: `welcome:${user.id}`,
        action: "grant",
        source: "welcome",
        units: WELCOME_CREDITS,
        balanceBefore: user.credits,
        balanceAfter: user.credits + WELCOME_CREDITS,
        note: "이메일 신규 가입 웰컴 크레딧",
        reasonCode: "WELCOME_CREDITS_GRANTED",
        metadata: { authProvider: "email" },
      });
    }
    return tx.user.findUnique({ where: { id: user.id } });
  });
  if (!verified) return verifyRedirect(req, "invalid_token");

  const session = await getSession();
  if (session.sessionId) {
    await prisma.userSession.deleteMany({ where: { id: session.sessionId } });
  }
  const registeredSession = await createUserSession(
    verified.id,
    req.headers.get("user-agent") || ""
  );
  session.userId = verified.id;
  session.email = verified.email;
  session.role = verified.role;
  session.sessionId = registeredSession.id;
  session.usedTemporaryPassword = false;
  session.authMethod = "password";
  await session.save();

  return NextResponse.redirect(new URL("/", req.url));
}
