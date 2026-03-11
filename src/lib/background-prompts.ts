export function buildCleanupPrompt(userPrompt?: string): string {
  if (userPrompt && userPrompt.trim()) {
    return `이 이미지에서 ${userPrompt.trim()}를 포함한 모든 주요 물체를 지우고 자연스러운 배경만 남겨줘.`;
  }
  return "이 이미지에서 사람을 포함한 주요 물체들을 모두 지우고 자연스러운 배경만 남겨줘.";
}

export const DEFAULT_STYLIZE_PROMPT =
  "이 배경 이미지를 검고 굵은 아웃라인을 사용하는 아동용 일러스트 스타일로 바꿔줘.\n2D 카툰 배경으로 사용.\n최대한 단순한 이미지로 바꿔줘.";

export function buildStylizePrompt(userPrompt?: string): string {
  return userPrompt?.trim() || DEFAULT_STYLIZE_PROMPT;
}

export function buildAnglesPrompt(
  angles: string[],
  additionalPrompt?: string
): string {
  const allPrompts = [...angles];
  if (additionalPrompt?.trim()) {
    allPrompts.push(additionalPrompt.trim());
  }
  const combined = allPrompts.join(", ");
  return `이 일러스트를 "${combined}" 관점에서 새로 그려줘.`;
}
