import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";

const sessionOptions = {
  password: process.env.SESSION_SECRET || "autocartoon-fallback-secret-key-32chars!!",
  cookieName: "autocartoon_session",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 퍼블릭 경로 + 정적 파일
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/presets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robot-wony.png" ||
    pathname === "/guide.html" ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  // 비인증 → 로그인 리다이렉트
  if (!session.userId) {
    return NextResponse.redirect(new URL("/login", request.url));
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
