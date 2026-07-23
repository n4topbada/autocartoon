const LOCAL_APP_ORIGIN = "http://localhost:3000";
const warnedInvalidOrigins = new Set<string>();

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use http or https.");
  }
  return url.origin;
}

function normalizeOriginCandidate(value: string | undefined, source: string) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    return normalizeOrigin(candidate);
  } catch (error) {
    if (!warnedInvalidOrigins.has(source)) {
      warnedInvalidOrigins.add(source);
      console.error(JSON.stringify({
        event: "app_origin_invalid",
        source,
        reason: error instanceof Error ? error.message : "Invalid URL",
      }));
    }
    return null;
  }
}

/**
 * Returns the browser-visible origin instead of an internal proxy/container URL.
 * APP_ORIGIN is server-only so Cloud Run can change it without rebuilding Next.js.
 */
export function getAppOrigin(requestOrigin?: string) {
  return (
    normalizeOriginCandidate(process.env.APP_ORIGIN, "APP_ORIGIN") ??
    normalizeOriginCandidate(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL") ??
    normalizeOriginCandidate(process.env.CLOUD_RUN_BASE_URL, "CLOUD_RUN_BASE_URL") ??
    normalizeOriginCandidate(requestOrigin, "requestOrigin") ??
    LOCAL_APP_ORIGIN
  );
}

export function getAppUrl(path: string, requestOrigin?: string) {
  return new URL(path, `${getAppOrigin(requestOrigin)}/`).toString();
}
