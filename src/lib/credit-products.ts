export const WELCOME_CREDITS = 30;
export const CREDIT_UNIT_PRICE_KRW = 12;

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
  tts: 1,
  image1k: 10,
  image2k: 20,
  videoBase: 60,
  videoSixSeconds: 20,
  videoEightSeconds: 40,
  video1080p: 40,
  videoAudio: 10,
  seedance720pPerSecond: 18,
  seedance1080pPerSecond: 48,
} as const;

export const CREDIT_COST_ROWS = [
  { label: "AI 채팅", credits: AI_CREDIT_COSTS.chat },
  { label: "캐릭터 설계", credits: AI_CREDIT_COSTS.characterDesigner },
  { label: "기획안·영상 플랜", credits: AI_CREDIT_COSTS.projectBrief },
  { label: "영상 프롬프트 확장", credits: AI_CREDIT_COSTS.videoPrompt },
  { label: "OCR·음성 미리듣기", credits: AI_CREDIT_COSTS.ocr },
  { label: "이미지 1K 1장", credits: AI_CREDIT_COSTS.image1k },
  { label: "이미지 2K 1장", credits: AI_CREDIT_COSTS.image2k },
  { label: "영상 기본", credits: AI_CREDIT_COSTS.videoBase },
] as const;

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
    const provider = String(input.provider ?? "veo").toLowerCase();
    const duration = positiveInteger(input.durationSeconds ?? input.duration, 5, provider === "seedance" ? 15 : 8);
    const resolution = String(input.resolution ?? "720p").toLowerCase();
    const audio = input.generateAudio === true || input.audio === true;

    if (provider === "seedance") {
      const perSecond = resolution === "1080p"
        ? AI_CREDIT_COSTS.seedance1080pPerSecond
        : AI_CREDIT_COSTS.seedance720pPerSecond;
      return duration * perSecond;
    }

    let total = AI_CREDIT_COSTS.videoBase;
    if (duration >= 8) total += AI_CREDIT_COSTS.videoEightSeconds;
    else if (duration >= 6) total += AI_CREDIT_COSTS.videoSixSeconds;
    if (resolution === "1080p") total += AI_CREDIT_COSTS.video1080p;
    if (audio) total += AI_CREDIT_COSTS.videoAudio;
    return total;
  }

  const count = positiveInteger(input.count, 1);
  const size = String(input.imageSize ?? input.size ?? "1K").toUpperCase();
  const unitCost = size === "2K" ? AI_CREDIT_COSTS.image2k : AI_CREDIT_COSTS.image1k;
  return unitCost * count;
}
