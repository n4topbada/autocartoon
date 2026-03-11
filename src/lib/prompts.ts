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

/* ====== Background-image mode prompts ====== */

const BG_IMAGE_INSTRUCTION = `[Background Image] One of the attached images (right after the character references) is the background.
Composite the character naturally onto this background. Match the lighting, perspective, and scale so the character looks like they belong in the scene.
Do NOT alter the background image significantly — keep its composition and details intact while placing the character within it.`;

export function buildTextWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The first attached images are reference sheets for the character "${ctx.characterName}". The image right after them is the background to use.`,
    `[Task] Generate a NEW illustration of this character placed naturally within the provided background image:`,
    `${ctx.userPrompt}`,
    BG_IMAGE_INSTRUCTION,
    STYLE_INSTRUCTION,
  ];
  return parts.join("\n\n");
}

export function buildSketchWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The first attached images are reference sheets for the character "${ctx.characterName}". The next image is the background. The LAST attached image is a rough sketch drawn by the user.`,
    `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style. Place the character onto the provided background image.`,
  ];
  if (ctx.userPrompt) {
    parts.push(`[Additional Instructions] ${ctx.userPrompt}`);
  }
  parts.push(BG_IMAGE_INSTRUCTION, STYLE_INSTRUCTION);
  return parts.join("\n\n");
}

export function buildEditWithBgImagePrompt(ctx: PromptContext): string {
  const parts = [
    `[Character Reference] The first attached images are reference sheets for the character "${ctx.characterName}". The next image is the background. The LAST attached image is the existing illustration to be edited.`,
    `[Task] Edit the last image according to the following instructions. Place the character onto the provided background image while keeping the character's identity and art style consistent:`,
    `${ctx.userPrompt}`,
    BG_IMAGE_INSTRUCTION,
    STYLE_INSTRUCTION,
  ];
  return parts.join("\n\n");
}
