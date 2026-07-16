export const PROJECT_BRIEF_TEMPLATE = `# 인스타툰 콘텐츠 기획서

## 1. 콘텐츠 개요
- 프로젝트명:
- 업종 / 브랜드명:
- 콘텐츠 목적:
- 타깃 독자:

## 2. 핵심 메시지
- 한 줄 메시지:
- 핵심 포인트:
- CTA:

## 3. 콘텐츠 흐름
- Hook:
- Relate:
- Twist:
- Punchline:
- CTA:

## 4. 컷별 구성
### 컷 1
- 대사:
- 화면 텍스트:
- 연출:

### 컷 2
- 대사:
- 화면 텍스트:
- 연출:

### 컷 3
- 대사:
- 화면 텍스트:
- 연출:

### 컷 4
- 대사:
- 화면 텍스트:
- 연출:`;

export interface PlannedProjectCut {
  title: string;
  prompt: string;
  negativePrompt: string;
  dialogue: string;
  speakerName: string;
  durationMs: number;
}

export interface PlannedProject {
  title: string;
  summary: string;
  cuts: PlannedProjectCut[];
}

const MAX_CUTS = 30;

function asText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizePlannedProject(value: unknown): PlannedProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI 기획 결과가 올바른 객체가 아닙니다.");
  }

  const record = value as Record<string, unknown>;
  const rawCuts = Array.isArray(record.cuts) ? record.cuts.slice(0, MAX_CUTS) : [];
  const cuts = rawCuts.map((item, index) => {
    const cut = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const duration = typeof cut.durationMs === "number" && Number.isFinite(cut.durationMs)
      ? Math.round(cut.durationMs)
      : 5_000;

    return {
      title: asText(cut.title, 100) || `컷 ${index + 1}`,
      prompt: asText(cut.prompt, 4_000),
      negativePrompt: asText(cut.negativePrompt, 1_000),
      dialogue: asText(cut.dialogue, 2_000),
      speakerName: asText(cut.speakerName, 100),
      durationMs: Math.min(15_000, Math.max(2_000, duration)),
    };
  }).filter((cut) => cut.prompt);

  if (cuts.length === 0) {
    throw new Error("기획서에서 생성할 컷을 찾지 못했습니다.");
  }

  return {
    title: asText(record.title, 120) || "기획서 프로젝트",
    summary: asText(record.summary, 2_000),
    cuts,
  };
}

export const PROJECT_BRIEF_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "프로젝트 제목" },
    summary: { type: "string", description: "기획 의도와 전체 흐름 요약" },
    cuts: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CUTS,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "짧은 컷 제목" },
          prompt: {
            type: "string",
            description: "이미지 모델에 바로 전달할 수 있는 구체적인 장면, 구도, 표정, 행동, 배경 지시",
          },
          negativePrompt: { type: "string", description: "피해야 할 왜곡과 요소" },
          dialogue: { type: "string", description: "이 컷에서 읽을 대사. 없으면 빈 문자열" },
          speakerName: { type: "string", description: "대사를 말하는 캐릭터 이름. 없으면 빈 문자열" },
          durationMs: { type: "integer", minimum: 2000, maximum: 15000 },
        },
        required: [
          "title",
          "prompt",
          "negativePrompt",
          "dialogue",
          "speakerName",
          "durationMs",
        ],
      },
    },
  },
  required: ["title", "summary", "cuts"],
} as const;
