/**
 * ============================================================
 * 프롬프트 설정 파일
 * ============================================================
 * 각 기능별 프롬프트 템플릿을 여기서 수정하세요.
 * 템플릿 안에서 사용 가능한 변수:
 *   {{characterName}} — 캐릭터 이름
 *   {{userPrompt}}    — 사용자 입력 프롬프트
 *   {{background}}    — 배경 설명 (선택)
 *   {{angles}}        — 앵글 목록 (배경 앵글용)
 * ============================================================
 */

// ─── 공통 스타일 지시문 ─────────────────────────────────
export const STYLE_INSTRUCTION = `Output a single high-quality webtoon/cartoon-style illustration.
The image must maintain the exact same character design, proportions, color palette, and art style shown in the reference images.
Do not add any text, watermark, or UI elements to the image.
Allowed to generate people/characters freely.`;

// ─── 배경 이미지 합성 지시문 ─────────────────────────────
export const BG_IMAGE_INSTRUCTION = `[Background Image] One of the attached images (right after the character references) is the background.
Composite the character naturally onto this background. Match the lighting, perspective, and scale so the character looks like they belong in the scene.
Do NOT alter the background image significantly — keep its composition and details intact while placing the character within it.`;

// ─── 캐릭터 생성: 텍스트 모드 ───────────────────────────
export const TEXT_MODE = {
  /** 캐릭터 레퍼런스 설명 */
  reference: `[Character Reference] The attached images are reference sheets for the character "{{characterName}}". Study the design carefully.`,
  /** 생성 태스크 */
  task: `[Task] Generate a NEW illustration of this character in the following scene:`,
  /** 배경 지시 (배경 드롭다운 선택 시) */
  backgroundPrefix: `[Background]`,
};

// ─── 캐릭터 생성: 스케치 모드 ───────────────────────────
export const SKETCH_MODE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The LAST attached image is a rough sketch drawn by the user.`,
  task: `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style from the reference images.`,
  additionalPrefix: `[Additional Instructions]`,
  backgroundPrefix: `[Background]`,
};

// ─── 캐릭터 생성: 편집 모드 ─────────────────────────────
export const EDIT_MODE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The LAST attached image is the existing illustration to be edited.`,
  task: `[Task] Edit the last image according to the following instructions while keeping the character's identity and art style consistent:`,
  backgroundPrefix: `[Background]`,
};

// ─── 배경 이미지 모드: 텍스트 ───────────────────────────
export const TEXT_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The image right after them is the background to use.`,
  task: `[Task] Generate a NEW illustration of this character placed naturally within the provided background image:`,
};

// ─── 배경 이미지 모드: 스케치 ───────────────────────────
export const SKETCH_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The next image is the background. The LAST attached image is a rough sketch drawn by the user.`,
  task: `[Task] Transform the rough sketch into a polished webtoon-style illustration. Keep the pose and composition from the sketch, but render it in the character's art style. Place the character onto the provided background image.`,
  additionalPrefix: `[Additional Instructions]`,
};

// ─── 배경 이미지 모드: 편집 ─────────────────────────────
export const EDIT_WITH_BG_IMAGE = {
  reference: `[Character Reference] The first attached images are reference sheets for the character "{{characterName}}". The next image is the background. The LAST attached image is the existing illustration to be edited.`,
  task: `[Task] Edit the last image according to the following instructions. Place the character onto the provided background image while keeping the character's identity and art style consistent:`,
};

// ─── 배경 처리: 정리(Cleanup) ───────────────────────────
export const BG_CLEANUP = {
  /** 기본 (사용자 입력 없을 때) */
  default: `이 이미지에서 사람을 포함한 주요 물체들을 모두 지우고 자연스러운 배경만 남겨줘.`,
  /** 사용자 지정 ({{userPrompt}} 포함) */
  withPrompt: `이 이미지에서 {{userPrompt}}를 포함한 모든 주요 물체를 지우고 자연스러운 배경만 남겨줘.`,
};

// ─── 배경 처리: 스타일라이즈 ────────────────────────────
export const BG_STYLIZE = {
  default: `이 배경 이미지를 검고 굵은 아웃라인을 사용하는 아동용 일러스트 스타일로 바꿔줘.\n2D 카툰 배경으로 사용.\n최대한 단순한 이미지로 바꿔줘.`,
};

// ─── 배경 처리: 앵글 변경 ──────────────────────────────
export const BG_ANGLES = {
  template: `이 일러스트를 "{{angles}}" 관점에서 새로 그려줘.`,
};
