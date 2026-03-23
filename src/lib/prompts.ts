import {
  STYLE_INSTRUCTION,
  BG_IMAGE_INSTRUCTION,
  TEXT_MODE,
  SKETCH_MODE,
  EDIT_MODE,
  TRANSFORM_MODE,
  TEXT_WITH_BG_IMAGE,
  SKETCH_WITH_BG_IMAGE,
  EDIT_WITH_BG_IMAGE,
} from "./prompt-config";

export interface PromptContext {
  characterName: string;
  background?: string;
  userPrompt: string;
}

function fill(template: string, ctx: PromptContext): string {
  return template
    .replace(/\{\{characterName\}\}/g, ctx.characterName)
    .replace(/\{\{userPrompt\}\}/g, ctx.userPrompt);
}

export function buildTextPrompt(ctx: PromptContext): string {
  const parts = [
    fill(TEXT_MODE.reference, ctx),
    fill(TEXT_MODE.task, ctx),
    ctx.userPrompt,
  ];
  if (ctx.background) {
    parts.push(`${TEXT_MODE.backgroundPrefix} ${ctx.background}`);
  }
  parts.push(STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

export function buildSketchPrompt(ctx: PromptContext): string {
  const parts = [
    fill(SKETCH_MODE.reference, ctx),
    fill(SKETCH_MODE.task, ctx),
  ];
  if (ctx.userPrompt) {
    parts.push(`${SKETCH_MODE.additionalPrefix} ${ctx.userPrompt}`);
  }
  if (ctx.background) {
    parts.push(`${SKETCH_MODE.backgroundPrefix} ${ctx.background}`);
  }
  parts.push(STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

export function buildEditPrompt(ctx: PromptContext): string {
  const parts = [
    fill(EDIT_MODE.reference, ctx),
    fill(EDIT_MODE.task, ctx),
    ctx.userPrompt,
  ];
  if (ctx.background) {
    parts.push(`${EDIT_MODE.backgroundPrefix} ${ctx.background}`);
  }
  parts.push(STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

export function buildTransformPrompt(ctx: PromptContext): string {
  const parts = [
    fill(TRANSFORM_MODE.reference, ctx),
    fill(TRANSFORM_MODE.task, ctx),
  ];
  if (ctx.userPrompt) {
    parts.push(`[Additional Instructions] ${ctx.userPrompt}`);
  }
  parts.push(STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

/* ====== Background-image mode prompts ====== */

export function buildTextWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    fill(TEXT_WITH_BG_IMAGE.reference, ctx),
    fill(TEXT_WITH_BG_IMAGE.task, ctx),
    ctx.userPrompt,
    BG_IMAGE_INSTRUCTION,
    STYLE_INSTRUCTION,
  ];
  return parts.join("\n\n");
}

export function buildSketchWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    fill(SKETCH_WITH_BG_IMAGE.reference, ctx),
    fill(SKETCH_WITH_BG_IMAGE.task, ctx),
  ];
  if (ctx.userPrompt) {
    parts.push(`${SKETCH_WITH_BG_IMAGE.additionalPrefix} ${ctx.userPrompt}`);
  }
  parts.push(BG_IMAGE_INSTRUCTION, STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

export function buildEditWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    fill(EDIT_WITH_BG_IMAGE.reference, ctx),
    fill(EDIT_WITH_BG_IMAGE.task, ctx),
    ctx.userPrompt,
    BG_IMAGE_INSTRUCTION,
    STYLE_INSTRUCTION,
  ];
  return parts.join("\n\n");
}
