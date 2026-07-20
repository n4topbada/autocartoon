import { getPlatformAIProvider, getVideoModel } from "./platform-ai";
import {
  VIDEO_PROVIDER_PRICING,
  type VideoProviderId,
  type VideoResolution,
} from "./ai-pricing";

export type VideoProvider = VideoProviderId;
export type { VideoResolution };

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
      ? process.env.SEEDANCE_MODEL || VIDEO_PROVIDER_PRICING.seedance.models["1080p"]
      : process.env.SEEDANCE_FAST_MODEL || VIDEO_PROVIDER_PRICING.seedance.models["720p"];
  }
  return process.env.VERTEX_VIDEO_MODEL || VIDEO_PROVIDER_PRICING.veo.models[resolution] || getVideoModel();
}

export function getStoredJobProvider(provider: VideoProvider): string {
  return provider === "seedance" ? "seedance" : getPlatformAIProvider();
}

export function getSeedanceApiBaseUrl(): string {
  return (process.env.SEEDANCE_API_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3")
    .replace(/\/+$/, "");
}
