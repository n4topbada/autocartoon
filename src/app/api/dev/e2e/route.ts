import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 로컬 E2E 전용 픽스처 관리 경로.
// 프로덕션 빌드, DEV_E2E_ROUTE 미설정, 루프백이 아닌 클라이언트에서는 존재하지 않는 경로처럼 404를 반환한다.
const FIXTURE_DOMAIN = "@dev-e2e.local";

const FIXTURES = [
  {
    key: "admin",
    email: `admin${FIXTURE_DOMAIN}`,
    name: "E2E Admin",
    role: "admin",
    tier: "enterprise",
    credits: 500_000,
  },
  {
    key: "user",
    email: `user${FIXTURE_DOMAIN}`,
    name: "E2E User",
    role: "user",
    tier: "free",
    credits: 100_000,
  },
] as const;

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const MIN_FIXTURE_PASSWORD_LENGTH = 16;

function isLoopbackRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return false;
  const addresses = forwarded
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    addresses.length > 0 &&
    addresses.every((address) => LOOPBACK_ADDRESSES.has(address))
  );
}

function guard(req: NextRequest): NextResponse | null {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEV_E2E_ROUTE !== "true" ||
    !isLoopbackRequest(req)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const users = await prisma.user.findMany({
    where: { email: { endsWith: FIXTURE_DOMAIN } },
    select: { email: true, role: true, tier: true, credits: true, emailVerified: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json({ enabled: true, fixtures: users });
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  let body: { action?: unknown; password?: unknown; email?: unknown; credits?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "ensure") {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_FIXTURE_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json(
        { error: `password는 ${MIN_FIXTURE_PASSWORD_LENGTH}자 이상 72바이트 이하여야 합니다.` },
        { status: 400 }
      );
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const results = [];
    for (const fixture of FIXTURES) {
      const user = await prisma.user.upsert({
        where: { email: fixture.email },
        update: {
          passwordHash,
          role: fixture.role,
          tier: fixture.tier,
          credits: fixture.credits,
          emailVerified: true,
          temporaryPasswordHash: null,
          temporaryPasswordExpiresAt: null,
          temporaryPasswordIssuedAt: null,
        },
        create: {
          email: fixture.email,
          passwordHash,
          name: fixture.name,
          role: fixture.role,
          tier: fixture.tier,
          credits: fixture.credits,
          emailVerified: true,
          welcomeCreditsGrantedAt: new Date(),
        },
        select: { id: true, email: true, role: true, credits: true },
      });
      results.push(user);
    }
    return NextResponse.json({ ok: true, fixtures: results });
  }

  if (action === "create-user") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const extra = body as {
      role?: unknown;
      credits?: unknown;
      emailVerified?: unknown;
      verifyToken?: unknown;
      kakaoId?: unknown;
      googleId?: unknown;
    };
    if (!email.endsWith(FIXTURE_DOMAIN)) {
      return NextResponse.json({ error: `email은 ${FIXTURE_DOMAIN}로 끝나야 합니다.` }, { status: 400 });
    }
    if (password.length < MIN_FIXTURE_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json(
        { error: `password는 ${MIN_FIXTURE_PASSWORD_LENGTH}자 이상 72바이트 이하여야 합니다.` },
        { status: 400 }
      );
    }
    const role = extra.role === "admin" ? "admin" : "user";
    const credits =
      typeof extra.credits === "number" && Number.isFinite(extra.credits)
        ? Math.min(Math.max(Math.floor(extra.credits), 0), 10_000_000)
        : 0;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash: await bcrypt.hash(password, 12),
        role,
        credits,
        emailVerified: extra.emailVerified !== false,
        verifyToken: typeof extra.verifyToken === "string" ? extra.verifyToken : null,
        verifyTokenExp: typeof extra.verifyToken === "string" ? new Date(Date.now() + 60 * 60 * 1000) : null,
        kakaoId: typeof extra.kakaoId === "string" ? extra.kakaoId : null,
        googleId: typeof extra.googleId === "string" ? extra.googleId : null,
      },
      create: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        name: `E2E ${email.split("@")[0]}`,
        role,
        tier: "free",
        credits,
        emailVerified: extra.emailVerified !== false,
        verifyToken: typeof extra.verifyToken === "string" ? extra.verifyToken : null,
        verifyTokenExp: typeof extra.verifyToken === "string" ? new Date(Date.now() + 60 * 60 * 1000) : null,
        kakaoId: typeof extra.kakaoId === "string" ? extra.kakaoId : null,
        googleId: typeof extra.googleId === "string" ? extra.googleId : null,
        welcomeCreditsGrantedAt: new Date(),
      },
      select: { id: true, email: true, role: true, credits: true, emailVerified: true },
    });
    return NextResponse.json({ ok: true, user });
  }

  if (action === "topup") {
    const email = typeof body.email === "string" ? body.email : "";
    const credits = typeof body.credits === "number" ? Math.floor(body.credits) : NaN;
    if (!email.endsWith(FIXTURE_DOMAIN) || !Number.isFinite(credits) || credits < 0 || credits > 10_000_000) {
      return NextResponse.json({ error: "픽스처 계정과 0~10,000,000 사이 credits가 필요합니다." }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { email },
      data: { credits },
      select: { email: true, credits: true },
    });
    return NextResponse.json({ ok: true, user });
  }

  return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
}
