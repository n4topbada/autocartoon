export const AI_PRICING_POLICY = {
  creditKrw: 12,
  markupMultiplier: 1.5,
  usdToKrw: 1_500,
  checkedAt: "2026-07-20",
} as const;

export const IMAGE_MODEL_IDS = [
  "nano-banana-2",
  "nano-banana-pro",
  "nano-banana-2-lite",
  "gpt-image-2",
] as const;

export type ImageModelId = (typeof IMAGE_MODEL_IDS)[number];
export type ImageResolution = "1K" | "2K";
export type ImageModelAvailability = "available" | "planned";

export interface ImageModelPrice {
  id: ImageModelId;
  label: string;
  providerLabel: string;
  apiModel: string;
  availability: ImageModelAvailability;
  disabledReason?: string;
  thinkingLevel?: "MINIMAL";
  supportedResolutions: readonly ImageResolution[];
  usdPerImage: Readonly<Partial<Record<ImageResolution, number>>>;
  pricingSource: string;
}

export const DEFAULT_IMAGE_MODEL_ID: ImageModelId = "nano-banana-2";
export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = "1K";

export const IMAGE_MODEL_PRICING: Readonly<Record<ImageModelId, ImageModelPrice>> = {
  "nano-banana-2": {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    providerLabel: "Google Vertex AI",
    apiModel: "gemini-3.1-flash-image",
    availability: "available",
    thinkingLevel: "MINIMAL",
    supportedResolutions: ["1K", "2K"],
    usdPerImage: { "1K": 0.067, "2K": 0.101 },
    pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
  },
  "nano-banana-pro": {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    providerLabel: "Google Vertex AI",
    apiModel: "gemini-3-pro-image",
    availability: "available",
    supportedResolutions: ["1K", "2K"],
    usdPerImage: { "1K": 0.134, "2K": 0.134 },
    pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
  },
  "nano-banana-2-lite": {
    id: "nano-banana-2-lite",
    label: "Nano Banana 2 Lite",
    providerLabel: "Google Vertex AI",
    apiModel: "gemini-3.1-flash-lite-image",
    availability: "available",
    thinkingLevel: "MINIMAL",
    supportedResolutions: ["1K"],
    usdPerImage: { "1K": 0.034 },
    pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
  },
  "gpt-image-2": {
    id: "gpt-image-2",
    label: "GPT Image 2",
    providerLabel: "OpenAI API",
    apiModel: "gpt-image-2",
    availability: "planned",
    disabledReason: "OpenAI API 연결 예정",
    supportedResolutions: ["1K", "2K"],
    // Medium 품질의 공식 출력 토큰 계산기 결과(1K 1,756 / 2K 3,568)에 $30/M을 적용한다.
    usdPerImage: { "1K": 0.05268, "2K": 0.10704 },
    pricingSource: "https://developers.openai.com/api/docs/pricing#image-generation",
  },
};

export const VIDEO_PROVIDER_IDS = ["veo", "seedance"] as const;
export type VideoProviderId = (typeof VIDEO_PROVIDER_IDS)[number];
export type VideoResolution = "720p" | "1080p";

interface VideoPriceByAudio {
  silent: number;
  audio: number;
}

export interface VideoProviderPrice {
  id: VideoProviderId;
  label: string;
  models: Readonly<Record<VideoResolution, string>>;
  usdPerSecond: Readonly<Record<VideoResolution, VideoPriceByAudio>>;
  pricingSource: string;
}

export const VIDEO_PROVIDER_PRICING: Readonly<Record<VideoProviderId, VideoProviderPrice>> = {
  veo: {
    id: "veo",
    label: "Veo 3.1 Fast",
    models: {
      "720p": "veo-3.1-fast-generate-001",
      "1080p": "veo-3.1-fast-generate-001",
    },
    usdPerSecond: {
      "720p": { silent: 0.08, audio: 0.10 },
      "1080p": { silent: 0.10, audio: 0.12 },
    },
    pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
  },
  seedance: {
    id: "seedance",
    label: "Seedance 2.0",
    models: {
      "720p": "dreamina-seedance-2-0-fast-260128",
      "1080p": "dreamina-seedance-2-0-260128",
    },
    // BytePlus는 현재 선택 조합에서 오디오 여부와 무관하게 같은 초당 단가를 고지한다.
    usdPerSecond: {
      "720p": { silent: 0.12, audio: 0.12 },
      "1080p": { silent: 0.37, audio: 0.37 },
    },
    pricingSource: "https://docs.byteplus.com/en/docs/ModelArk/1544106",
  },
};

export function isImageModelId(value: unknown): value is ImageModelId {
  return typeof value === "string" && IMAGE_MODEL_IDS.includes(value as ImageModelId);
}

export function normalizeImageModelId(value: unknown): ImageModelId {
  return isImageModelId(value) ? value : DEFAULT_IMAGE_MODEL_ID;
}

export function getImageModelPriceByApiModel(apiModel: string): ImageModelPrice | undefined {
  return IMAGE_MODEL_IDS
    .map((id) => IMAGE_MODEL_PRICING[id])
    .find((model) => model.apiModel === apiModel);
}

export function isImageResolution(value: unknown): value is ImageResolution {
  return value === "1K" || value === "2K";
}

export function isImageResolutionSupported(modelId: ImageModelId, resolution: ImageResolution) {
  return IMAGE_MODEL_PRICING[modelId].supportedResolutions.includes(resolution);
}

export function getDefaultImageResolution(modelId: ImageModelId): ImageResolution {
  return IMAGE_MODEL_PRICING[modelId].supportedResolutions[0] || DEFAULT_IMAGE_RESOLUTION;
}

export function apiUsdToCredits(apiCostUsd: number): number {
  if (!Number.isFinite(apiCostUsd) || apiCostUsd <= 0) return 0;
  const rawCredits = (
    apiCostUsd *
    AI_PRICING_POLICY.usdToKrw *
    AI_PRICING_POLICY.markupMultiplier
  ) / AI_PRICING_POLICY.creditKrw;
  return Math.max(1, Math.ceil(rawCredits - 1e-9));
}

export function getImageApiCostUsd(
  modelId: ImageModelId,
  resolution: ImageResolution,
  count = 1
): number {
  const unitCost = IMAGE_MODEL_PRICING[modelId].usdPerImage[resolution];
  if (unitCost === undefined) {
    throw new Error(`${IMAGE_MODEL_PRICING[modelId].label}은 ${resolution} 출력을 지원하지 않습니다.`);
  }
  return unitCost * Math.max(1, Math.min(5, Math.floor(count)));
}

export function getImageGenerationCredits(
  modelId: ImageModelId,
  resolution: ImageResolution,
  count = 1
): number {
  return apiUsdToCredits(getImageApiCostUsd(modelId, resolution, count));
}

export function getVideoApiCostUsd(
  provider: VideoProviderId,
  resolution: VideoResolution,
  durationSeconds: number,
  generateAudio: boolean
): number {
  const rate = VIDEO_PROVIDER_PRICING[provider].usdPerSecond[resolution];
  const seconds = Math.max(1, Math.floor(durationSeconds));
  return (generateAudio ? rate.audio : rate.silent) * seconds;
}

export function getVideoGenerationCredits(
  provider: VideoProviderId,
  resolution: VideoResolution,
  durationSeconds: number,
  generateAudio: boolean
): number {
  return apiUsdToCredits(
    getVideoApiCostUsd(provider, resolution, durationSeconds, generateAudio)
  );
}
