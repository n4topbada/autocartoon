const PUBLIC_PAGE_ROUTES = ["/login", "/verify", "/terms", "/privacy", "/refund"];
const PUBLIC_API_ROUTES = ["/api/auth", "/api/media", "/api/tasks"];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isStaticPath(pathname: string): boolean {
  return (
    matchesRoute(pathname, "/_next") ||
    matchesRoute(pathname, "/presets") ||
    matchesRoute(pathname, "/uploads") ||
    pathname === "/favicon.ico" ||
    pathname === "/robot-wony.png"
  );
}

export function isPublicPageRoute(pathname: string): boolean {
  return PUBLIC_PAGE_ROUTES.some((route) => matchesRoute(pathname, route));
}

export function isPublicRoute(pathname: string): boolean {
  return (
    isPublicPageRoute(pathname) ||
    // These APIs perform their own object/session/task authentication.
    PUBLIC_API_ROUTES.some((route) => matchesRoute(pathname, route))
  );
}
