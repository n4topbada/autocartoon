import {
  AI_PRICING_POLICY,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_MODEL_IDS,
  IMAGE_MODEL_PRICING,
  getDefaultImageResolution,
  getImageGenerationCredits,
  getVideoGenerationCredits,
  isImageResolution,
  isImageResolutionSupported,
  normalizeImageModelId,
  type VideoProviderId,
  type VideoResolution,
} from "./ai-pricing";

export const WELCOME_CREDITS = 100;
export const CREDIT_UNIT_PRICE_KRW = AI_PRICING_POLICY.creditKrw;

export const CREDIT_PRODUCTS = [
  {
    code: "light",
    name: "라이트",
    credits: 100,
    amountKrw: 1_200,
  },
  {
    code: "starter",
    name: "스타터",
    credits: 500,
    amountKrw: 6_000,
    bonusCredits: 100,
  },
  {
    code: "creator",
    name: "크리에이터",
    credits: 2_000,
    amountKrw: 24_000,
    bonusCredits: 500,
  },
  {
    code: "studio",
    name: "스튜디오",
    credits: 8_000,
    amountKrw: 96_000,
    bonusCredits: 3_000,
  },
] as const;

export type CreditProduct = (typeof CREDIT_PRODUCTS)[number];

export function getCreditProduct(code: string): CreditProduct | undefined {
  return CREDIT_PRODUCTS.find((product) => product.code === code);
}

/** 기본 크레딧 + 보너스 크레딧을 합한, 실제로 적립해야 하는 총 크레딧. */
export function getProductTotalCredits(product: CreditProduct): number {
  return product.credits + ("bonusCredits" in product ? product.bonusCredits : 0);
}

/** 구매 크레딧을 기준으로 계산한 보너스 지급률. */
export function getProductBonusRate(product: CreditProduct): number {
  const bonusCredits = "bonusCredits" in product ? product.bonusCredits : 0;
  return (bonusCredits / product.credits) * 100;
}

export const AI_CREDIT_COSTS = {
  chat: 1,
  characterDesigner: 2,
  projectBrief: 2,
  videoPlan: 2,
  videoPrompt: 1,
  ocr: 1,
  cutout: 25,
  tts: 1,
  image1k: getImageGenerationCredits(DEFAULT_IMAGE_MODEL_ID, "1K"),
  image2k: getImageGenerationCredits(DEFAULT_IMAGE_MODEL_ID, "2K"),
} as const;

export const CREDIT_COST_ROWS: ReadonlyArray<{ label: string; credits: number }> = [
  { label: "AI 채팅", credits: AI_CREDIT_COSTS.chat },
  { label: "캐릭터 설계", credits: AI_CREDIT_COSTS.characterDesigner },
  { label: "기획안·영상 플랜", credits: AI_CREDIT_COSTS.projectBrief },
  { label: "영상 프롬프트 확장", credits: AI_CREDIT_COSTS.videoPrompt },
  { label: "OCR·음성 미리듣기", credits: AI_CREDIT_COSTS.ocr },
  { label: "고화질 누끼 1장", credits: AI_CREDIT_COSTS.cutout },
  ...IMAGE_MODEL_IDS.flatMap((modelId) => {
    const model = IMAGE_MODEL_PRICING[modelId];
    return model.supportedResolutions.map((resolution) => ({
      label: `${model.label} ${resolution}${model.availability === "planned" ? " (연결 예정)" : ""}`,
      credits: getImageGenerationCredits(modelId, resolution),
    }));
  }),
  { label: "Veo 3.1 Fast 720p 4초 (무음)", credits: getVideoGenerationCredits("veo", "720p", 4, false) },
  { label: "Veo 3.1 Fast 720p 4초 (오디오)", credits: getVideoGenerationCredits("veo", "720p", 4, true) },
  { label: "Veo 3.1 Fast 1080p 4초 (무음)", credits: getVideoGenerationCredits("veo", "1080p", 4, false) },
  { label: "Veo 3.1 Fast 1080p 4초 (오디오)", credits: getVideoGenerationCredits("veo", "1080p", 4, true) },
  { label: "Seedance 2.0 Fast 720p 4초", credits: getVideoGenerationCredits("seedance", "720p", 4, true) },
  { label: "Seedance 2.0 Standard 1080p 4초", credits: getVideoGenerationCredits("seedance", "1080p", 4, true) },
];

type GenerationInput = Record<string, unknown>;

function positiveInteger(value: unknown, fallback: number, maximum = 5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function isVideoKind(kind: string) {
  return kind.toLowerCase().includes("video");
}

export function getGenerationCreditCost(kind: string, input: GenerationInput): number {
  const normalizedKind = kind.toLowerCase();
  if (normalizedKind === "short") return 0;
  if (isVideoKind(normalizedKind)) {
    const provider: VideoProviderId = String(input.provider ?? "veo").toLowerCase() === "seedance"
      ? "seedance"
      : "veo";
    const duration = positiveInteger(input.durationSeconds ?? input.duration, 5, provider === "seedance" ? 15 : 8);
    const resolution: VideoResolution = String(input.resolution ?? "720p").toLowerCase() === "1080p"
      ? "1080p"
      : "720p";
    const audio = input.generateAudio === true || input.audio === true;
    return getVideoGenerationCredits(provider, resolution, duration, audio);
  }

  const count = positiveInteger(input.count, 1);
  const modelId = normalizeImageModelId(input.imageModel ?? input.model);
  const requestedSize = String(input.imageSize ?? input.size ?? DEFAULT_IMAGE_RESOLUTION).toUpperCase();
  const parsedSize = isImageResolution(requestedSize) ? requestedSize : DEFAULT_IMAGE_RESOLUTION;
  const size = isImageResolutionSupported(modelId, parsedSize)
    ? parsedSize
    : getDefaultImageResolution(modelId);
  return getImageGenerationCredits(modelId, size, count);
}
