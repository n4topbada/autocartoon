/**
 * Prompt configuration.
 *
 * Template variables:
 *   {{characterName}} - character name
 *   {{userPrompt}}    - user instructions
 *   {{background}}    - optional background description
 *   {{angles}}        - background angle instructions
 */

export const STYLE_INSTRUCTION = `Output a single high-quality webtoon/cartoon-style illustration.
The image must maintain the exact same character design, proportions, color palette, and art style shown in the reference images.
Do not add any text, watermark, or UI elements to the image.
Allowed to generate people/characters freely.

CRITICAL - DENSITY MATCHING: Match the visual density, line count, and complexity of the reference images exactly.
If the reference has simple lines with lots of whitespace, keep it equally simple and sparse.
Do NOT add extra details, textures, shading, hatching, or complexity beyond what the reference images show.
The density of lines and elements per pixel area must closely match the reference style.`;

export const BG_IMAGE_INSTRUCTION = `[Background Image] One of the attached images (right after the character references) is the background.
Composite the character naturally onto this background. Match the lighting, perspective, and scale so the character looks like they belong in the scene.
Do NOT alter the background image significantly - keep its composition and details intact while placing the character within it.`;

export const TEXT_MODE = {
  reference: `[Character Reference] The attached images are reference sheets for the character "{{characterName}}". Study the design carefully.`,
  task: `[Task] Generate a NEW illustration of this character in the following scene:`,
  backgroundPrefix: `[Background]`,
};

export const SKETCH_MODE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The LAST attached image is a rough sketch drawn by the user.`,
  task: `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style from the reference images.`,
  additionalPrefix: `[Additional Instructions]`,
  backgroundPrefix: `[Background]`,
};

export const EDIT_MODE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The LAST attached image is the existing illustration to be edited.`,
  task: `[Task] Edit the last image according to the following instructions while keeping the character's identity and art style consistent:`,
  backgroundPrefix: `[Background]`,
};

export const TEXT_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The image right after them is the background to use.`,
  task: `[Task] Generate a NEW illustration of this character placed naturally within the provided background image:`,
};

export const SKETCH_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The next image is the background. The LAST attached image is a rough sketch drawn by the user.`,
  task: `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style. Place the character onto the provided background image.`,
  additionalPrefix: `[Additional Instructions]`,
};

export const EDIT_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The next image is the background. The LAST attached image is the existing illustration to be edited.`,
  task: `[Task] Edit the last image according to the following instructions. Place the character onto the provided background image while keeping the character's identity and art style consistent:`,
};

export const TRANSFORM_MODE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". Study the style, coloring, line weight, and density carefully.`,
  task: `[Task] The user's input images follow, each labeled with a number (1번, 2번, 3번, 4번).
Transform each numbered image into the exact same art style as the character reference.
Match line weight, color palette, shading style, and visual density precisely.
If any image contains text or letters, preserve them exactly as-is without modification.
Read any text in the images to understand context, mood, and situation, then apply appropriate design, background colors, and atmosphere accordingly.
When the user refers to "1번 이미지" or "image 1", it means the image labeled "=== 사용자 참조 이미지 1번 ===".`,
};

export const BG_CLEANUP = {
  default: `이 이미지에서 사람을 포함한 주요 물체들을 모두 지우고 자연스러운 배경만 남겨줘.`,
  withPrompt: `이 이미지에서 {{userPrompt}}를 포함한 모든 주요 물체를 지우고 자연스러운 배경만 남겨줘.`,
};

export const BG_STYLIZE = {
  default: `Convert the image into a quiet, simple 2D cartoon background for character compositing.
Use clean thick outlines, soft flat colors, and broad simple shapes.
Keep the scene calm and uncluttered.`,
  lowDensity: `Keep the background density extremely low.
Leave large empty areas and broad flat color surfaces.
Minimize small props, patterns, textures, line details, decorations, and visual noise.
If the source has many objects, keep only the core large structures and remove most details.`,
  guardrails: `Do NOT make an educational poster, infographic, diagram, UI screen, map, worksheet, or presentation slide.
Do NOT add any text, letters, labels, captions, arrows, icons, speech bubbles, signs, watermarks, numbers, or UI elements.
Do NOT invent extra objects that are not needed for the background.
The result must be a plain background image only, with no explanatory content.`,
};

export const BG_ANGLES = {
  template: `이 일러스트를 "{{angles}}" 관점에서 새로 그려줘.
Keep the background density extremely low, with large empty areas and simple large shapes.
Minimize small props, patterns, textures, line details, decorations, and visual noise.
Do NOT add text, labels, arrows, icons, signs, watermarks, numbers, or UI elements.`,
};
