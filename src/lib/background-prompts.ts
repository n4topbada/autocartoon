import { BG_CLEANUP, BG_STYLIZE, BG_ANGLES } from "./prompt-config";

export function buildCleanupPrompt(userPrompt?: string): string {
  if (userPrompt && userPrompt.trim()) {
    return BG_CLEANUP.withPrompt.replace("{{userPrompt}}", userPrompt.trim());
  }
  return BG_CLEANUP.default;
}

export const DEFAULT_STYLIZE_PROMPT = [
  BG_STYLIZE.default,
  BG_STYLIZE.lowDensity,
  BG_STYLIZE.guardrails,
].join("\n\n");

export function buildStylizePrompt(userPrompt?: string): string {
  const basePrompt = userPrompt?.trim() || DEFAULT_STYLIZE_PROMPT;
  const additions = [BG_STYLIZE.lowDensity, BG_STYLIZE.guardrails].filter(
    (text) => !basePrompt.includes(text)
  );
  if (additions.length === 0) return basePrompt;
  return [basePrompt, ...additions].join("\n\n");
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
  return BG_ANGLES.template.replace("{{angles}}", combined);
}
