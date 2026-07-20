const PUBLIC_PAGE_ROUTES = ["/login", "/verify", "/terms", "/privacy", "/refund"];
// /api/dev is a local-only E2E fixture path: it self-guards with NODE_ENV,
// DEV_E2E_ROUTE, and a loopback client check, returning 404 otherwise.
const PUBLIC_API_ROUTES = ["/api/auth", "/api/media", "/api/tasks", "/api/dev"];

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
