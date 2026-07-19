export interface ExpandedVideoPrompt {
  prompt: string;
  negativePrompt: string;
}

export const VIDEO_PROMPT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "negativePrompt"],
  properties: {
    prompt: { type: "string", minLength: 20, maxLength: 5_000 },
    negativePrompt: { type: "string", maxLength: 2_000 },
  },
} as const;

export function normalizeExpandedVideoPrompt(value: unknown): ExpandedVideoPrompt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("영상 프롬프트 결과 형식이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" ? record.prompt.trim().slice(0, 5_000) : "";
  const negativePrompt = typeof record.negativePrompt === "string"
    ? record.negativePrompt.trim().slice(0, 2_000)
    : "";
  if (prompt.length < 20) throw new Error("확장된 영상 프롬프트가 너무 짧습니다.");
  return { prompt, negativePrompt };
}
