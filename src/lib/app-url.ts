const LOCAL_APP_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use http or https.");
  }
  return url.origin;
}

/**
 * Returns the browser-visible origin instead of an internal proxy/container URL.
 * APP_ORIGIN is server-only so Cloud Run can change it without rebuilding Next.js.
 */
export function getAppOrigin(requestOrigin?: string) {
  const configured =
    process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return normalizeOrigin(configured || requestOrigin?.trim() || LOCAL_APP_ORIGIN);
}

export function getAppUrl(path: string, requestOrigin?: string) {
  return new URL(path, `${getAppOrigin(requestOrigin)}/`).toString();
}
