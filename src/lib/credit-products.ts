export const WELCOME_CREDITS = 30;

export const CREDIT_PRODUCTS = [
  {
    code: "starter",
    name: "스타터",
    credits: 120,
    amountKrw: 4_900,
  },
  {
    code: "creator",
    name: "크리에이터",
    credits: 360,
    amountKrw: 12_900,
    bonusCredits: 60,
  },
  {
    code: "studio",
    name: "스튜디오",
    credits: 1_200,
    amountKrw: 39_000,
    bonusCredits: 200,
  },
] as const;

export type CreditProduct = (typeof CREDIT_PRODUCTS)[number];

export function getCreditProduct(code: string): CreditProduct | undefined {
  return CREDIT_PRODUCTS.find((product) => product.code === code);
}

export const AI_CREDIT_COSTS = {
  chat: 1,
  characterDesigner: 2,
  projectBrief: 2,
  videoPlan: 2,
  ocr: 1,
  tts: 1,
  image1k: 10,
  image2k: 20,
  videoBase: 60,
  videoSixSeconds: 20,
  videoEightSeconds: 40,
  video1080p: 40,
  videoAudio: 10,
} as const;

export const CREDIT_COST_ROWS = [
  { label: "AI 채팅", credits: AI_CREDIT_COSTS.chat },
  { label: "캐릭터 설계", credits: AI_CREDIT_COSTS.characterDesigner },
  { label: "기획안·영상 플랜", credits: AI_CREDIT_COSTS.projectBrief },
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
  if (isVideoKind(normalizedKind)) {
    const duration = positiveInteger(input.durationSeconds ?? input.duration, 5, 8);
    const resolution = String(input.resolution ?? "720p").toLowerCase();
    const audio = input.generateAudio === true || input.audio === true;

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
