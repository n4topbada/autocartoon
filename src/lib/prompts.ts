export interface PromptContext {
  characterName: string;
  background?: string;
  userPrompt: string;
}

const STYLE_INSTRUCTION = `Output a single high-quality webtoon/cartoon-style illustration.
The image must maintain the exact same character design, proportions, color palette, and art style shown in the reference images.
Do not add any text, watermark, or UI elements to the image.
Allowed to generate people/characters freely.`;

export function buildTextPrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The attached images are reference sheets for the character "${ctx.characterName}". Study the design carefully.`,
    `[Task] Generate a NEW illustration of this character in the following scene:`,
    `${ctx.userPrompt}`,
  ];

  if (ctx.background) {
    parts.push(`[Background] ${ctx.background}`);
  }

  parts.push(STYLE_INSTRUCTION);

  return parts.join("\n\n");
}

export function buildSketchPrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The first attached images are reference sheets for the character "${ctx.characterName}". The LAST attached image is a rough sketch drawn by the user.`,
    `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style from the reference images.`,
  ];

  if (ctx.userPrompt) {
    parts.push(`[Additional Instructions] ${ctx.userPrompt}`);
  }

  if (ctx.background) {
    parts.push(`[Background] ${ctx.background}`);
  }

  parts.push(STYLE_INSTRUCTION);

  return parts.join("\n\n");
}

export function buildEditPrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The first attached images are reference sheets for the character "${ctx.characterName}". The LAST attached image is the existing illustration to be edited.`,
    `[Task] Edit the last image according to the following instructions while keeping the character's identity and art style consistent:`,
    `${ctx.userPrompt}`,
  ];

  if (ctx.background) {
    parts.push(`[Background] ${ctx.background}`);
  }

  parts.push(STYLE_INSTRUCTION);

  return parts.join("\n\n");
}
