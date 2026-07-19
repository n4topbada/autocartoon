import { getPlatformAIProvider, getVideoModel } from "./platform-ai";

export type VideoProvider = "veo" | "seedance";
export type VideoResolution = "720p" | "1080p";

export function normalizeVideoProvider(value: unknown): VideoProvider {
  return String(value || "").toLowerCase() === "seedance" ? "seedance" : "veo";
}

export function getAllowedVideoDurations(provider: VideoProvider): number[] {
  return provider === "seedance"
    ? Array.from({ length: 12 }, (_, index) => index + 4)
    : [4, 6, 8];
}

export function isAllowedVideoDuration(provider: VideoProvider, value: number): boolean {
  return Number.isInteger(value) && getAllowedVideoDurations(provider).includes(value);
}

export function isVideoProviderConfigured(provider: VideoProvider): boolean {
  if (provider === "seedance") return Boolean(process.env.SEEDANCE_API_KEY?.trim());
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GEMINI_API_KEY?.trim()
  );
}

export function getVideoProviderModel(
  provider: VideoProvider,
  resolution: VideoResolution
): string {
  if (provider === "seedance") {
    return resolution === "1080p"
      ? process.env.SEEDANCE_MODEL || "dreamina-seedance-2-0-260128"
      : process.env.SEEDANCE_FAST_MODEL || "dreamina-seedance-2-0-fast-260128";
  }
  return getVideoModel();
}

export function getStoredJobProvider(provider: VideoProvider): string {
  return provider === "seedance" ? "seedance" : getPlatformAIProvider();
}

export function getSeedanceApiBaseUrl(): string {
  return (process.env.SEEDANCE_API_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3")
    .replace(/\/+$/, "");
}
