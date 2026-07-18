import { isPublicPageRoute } from "./request-routing";

const FALLBACK_RETURN_TO = "/";
const LOCAL_ORIGIN = "https://wony.local";
const MAX_RETURN_TO_LENGTH = 2_048;

export type LoginRedirectReason = "login_required" | "session_expired";

export function normalizeReturnTo(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate.length > MAX_RETURN_TO_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return FALLBACK_RETURN_TO;
  }

  try {
    const parsed = new URL(candidate, LOCAL_ORIGIN);
    if (
      parsed.origin !== LOCAL_ORIGIN ||
      parsed.pathname === "/login" ||
      parsed.pathname.startsWith("/login/")
    ) {
      return FALLBACK_RETURN_TO;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK_RETURN_TO;
  }
}

export function addReturnTo(path: string, returnTo: string): string {
  const parsed = new URL(path, LOCAL_ORIGIN);
  parsed.searchParams.set("returnTo", normalizeReturnTo(returnTo));
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createLoginRedirect(
  returnTo: string,
  reason: LoginRedirectReason,
): string {
  const params = new URLSearchParams({
    returnTo: normalizeReturnTo(returnTo),
    reason,
  });
  return `/login?${params.toString()}`;
}

export function shouldRedirectForUnauthorizedApi(
  status: number,
  requestUrl: string,
  currentUrl: string,
): boolean {
  if (status !== 401) return false;

  try {
    const current = new URL(currentUrl, LOCAL_ORIGIN);
    if (isPublicPageRoute(current.pathname)) return false;

    const request = new URL(requestUrl, current.origin);
    if (request.origin !== current.origin || !request.pathname.startsWith("/api/")) {
      return false;
    }

    return (
      request.pathname !== "/api/auth/login" &&
      request.pathname !== "/api/auth/logout" &&
      !request.pathname.startsWith("/api/tasks/")
    );
  } catch {
    return false;
  }
}

let redirectStarted = false;

export function redirectToLogin(reason: LoginRedirectReason): boolean {
  if (typeof window === "undefined" || isPublicPageRoute(window.location.pathname)) {
    return false;
  }
  if (redirectStarted) return true;

  redirectStarted = true;
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(createLoginRedirect(returnTo, reason));
  return true;
}
