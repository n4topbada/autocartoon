import { BG_CLEANUP, BG_STYLIZE, BG_ANGLES } from "./prompt-config";

export function buildCleanupPrompt(userPrompt?: string): string {
  if (userPrompt && userPrompt.trim()) {
    return BG_CLEANUP.withPrompt.replace("{{userPrompt}}", userPrompt.trim());
  }
  return BG_CLEANUP.default;
}

export const DEFAULT_STYLIZE_PROMPT = BG_STYLIZE.default;

export function buildStylizePrompt(userPrompt?: string): string {
  return userPrompt?.trim() || BG_STYLIZE.default;
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
