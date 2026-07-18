import { NextRequest, NextResponse } from "next/server";
import { getIronSession, type SessionOptions } from "iron-session";
import { isPublicRoute, isStaticPath } from "@/lib/request-routing";
import { createLoginRedirect } from "@/lib/auth-navigation";
import type { SessionData } from "@/lib/session";

const MIN_SESSION_SECRET_LENGTH = 32;

function getSessionOptions(): SessionOptions | null {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < MIN_SESSION_SECRET_LENGTH) return null;

  return {
    password,
    cookieName: "autocartoon_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  };
}

function sessionUnavailable(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "인증 설정이 올바르지 않습니다." },
      { status: 503 }
    );
  }

  return new NextResponse("Authentication is unavailable.", {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticPath(pathname)) return NextResponse.next();

  const sessionOptions = getSessionOptions();
  if (!sessionOptions) return sessionUnavailable(pathname);

  if (isPublicRoute(pathname)) return NextResponse.next();

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  // 비인증 → 로그인 리다이렉트
  if (!session.userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(createLoginRedirect(returnTo, "login_required"), request.url)
    );
  }

  // 관리자 페이지 접근 제한
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
