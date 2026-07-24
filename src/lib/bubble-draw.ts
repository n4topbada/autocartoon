/**
 * 말풍선과 캔버스 도형을 그리는 Canvas 2D 렌더러.
 */

export type BubbleType =
  | "classic"
  | "soft"
  | "whisper"
  | "wavy"
  | "thought"
  | "radialThought"
  | "spiky"
  | "angry"
  | "needle"
  | "electric"
  | "broadcast"
  | "double"
  | "text"
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "cloud"
  | "star";

type BubbleStrokeStyle = "solid" | "dashed" | "dotted" | "rough";

export interface TextStyleRun {
  start: number;
  end: number;
  fontWeight?: number | "normal" | "bold";
  fontItalic?: boolean;
  underline?: boolean;
  baselineOffset?: number;
  textColor?: string;
}

export interface SpeechBubble {
  id: string;
  type: BubbleType;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  tailEnabled: boolean;
  tailTipX: number;
  tailTipY: number;
  tailWidth: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  fontItalic?: boolean;
  underline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  lineHeightScale?: number;
  letterSpacing?: number;
  baselineOffset?: number;
  textRuns?: TextStyleRun[];
  strokeStyle?: BubbleStrokeStyle;
  cornerRadius?: number;
  gradientColor?: string;
  gradientAngle?: number;
  gradientStop?: number;
  roughness?: number;
  wobble?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  rotation?: number;
  presetKind?: "watermark" | "caption" | "sfx";
  captionSlot?: "top" | "bottom";
  watermarkPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  watermarkMargin?: number;
}

export const SPEECH_BUBBLE_PRESETS = [
  { type: "classic", label: "기본", description: "일반적인 대사", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "soft", label: "부드러운 말", description: "친근하고 차분한 대사", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "whisper", label: "속삭임", description: "작고 조용한 목소리", tailEnabled: true, strokeStyle: "dashed", strokeWidth: 2 },
  { type: "wavy", label: "떨리는 말", description: "불안하거나 힘없는 목소리", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.25 },
  { type: "thought", label: "생각", description: "말하지 않은 속마음", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "radialThought", label: "집중선 속마음", description: "초미세 방사선으로 감싼 속마음", tailEnabled: false, strokeStyle: "solid", strokeWidth: 0.7, roughness: 0.28, wobble: 0.12 },
  { type: "cloud", label: "구름 대사", description: "들뜨거나 몽글한 대사", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "spiky", label: "외침", description: "크게 외치는 목소리", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.75 },
  { type: "angry", label: "비명", description: "격한 비명과 충격", tailEnabled: true, strokeStyle: "solid", strokeWidth: 3 },
  { type: "electric", label: "전자음", description: "로봇과 기계 음성", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "broadcast", label: "방송음", description: "전화·라디오·스피커 음성", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.5 },
  { type: "double", label: "메아리", description: "텔레파시와 울리는 목소리", tailEnabled: true, strokeStyle: "solid", strokeWidth: 2.25 },
] as const satisfies ReadonlyArray<{
  type: BubbleType;
  label: string;
  description: string;
  tailEnabled: boolean;
  strokeStyle: BubbleStrokeStyle;
  strokeWidth: number;
  roughness?: number;
  wobble?: number;
}>;

export type SpeechBubblePresetType = (typeof SPEECH_BUBBLE_PRESETS)[number]["type"];

export function getSpeechBubblePreset(type: BubbleType) {
  return SPEECH_BUBBLE_PRESETS.find((preset) => preset.type === type);
}

export function getSpeechBubblePresetPatch(type: SpeechBubblePresetType): Partial<SpeechBubble> {
  const preset = getSpeechBubblePreset(type)!;
  return {
    type,
    tailEnabled: preset.tailEnabled,
    strokeStyle: preset.strokeStyle,
    strokeWidth: preset.strokeWidth,
    roughness: "roughness" in preset ? preset.roughness : 0,
    wobble: "wobble" in preset ? preset.wobble : 0,
  };
}

export const BUBBLE_FONT_FAMILIES = [
  { id: "'Pretendard', 'Malgun Gothic', sans-serif", label: "프리텐다드 · 기본 · 대사" },
  { id: "'Noto Sans KR', 'Malgun Gothic', sans-serif", label: "노토 산스 · 차분한 대사" },
  { id: "'Gothic A1', 'Malgun Gothic', sans-serif", label: "고딕 A1 · 모던 대사" },
  { id: "'Nanum Gothic', 'Malgun Gothic', sans-serif", label: "나눔 고딕 · 보조 대사" },
  { id: "'Gowun Dodum', 'Malgun Gothic', sans-serif", label: "고운돋움 · 부드러운 대사" },
  { id: "'GangwonEdu Modu', 'Malgun Gothic', sans-serif", label: "강원교육 모두 · 깔끔 · 대사" },
  { id: "'Nanum Myeongjo', 'Batang', serif", label: "나눔 명조 · 내레이션 · 회상" },
  { id: "'Noto Serif KR', 'Batang', serif", label: "노토 명조 · 진중한 내레이션" },
  { id: "'Song Myung', 'Batang', serif", label: "송명 · 고전 내레이션" },
  { id: "'Nanum Pen Script', 'Comic Sans MS', cursive", label: "나눔 손글씨 · 속마음 · 손글씨" },
  { id: "'Nanum Brush Script', 'Comic Sans MS', cursive", label: "나눔 붓글씨 · 붓 느낌 강조" },
  { id: "'Gaegu', 'Comic Sans MS', cursive", label: "개구 · 귀여운 손글씨" },
  { id: "'Gamja Flower', 'Comic Sans MS', cursive", label: "감자꽃 · 깜찍한 손글씨" },
  { id: "'Hi Melody', 'Comic Sans MS', cursive", label: "하이멜로디 · 말랑한 손글씨" },
  { id: "'Yeon Sung', 'Comic Sans MS', cursive", label: "배민 연성체 · 둥근 붓 손글씨" },
  { id: "'Dongle', 'Comic Sans MS', cursive", label: "동글 · 둥근 손글씨" },
  { id: "'Poor Story', 'Comic Sans MS', cursive", label: "푸어스토리 · 삐뚤빼뚤 손글씨" },
  { id: "'OngleipEoyeonce', 'Comic Sans MS', cursive", label: "온글잎 의연 · 손글씨 · 감성" },
  { id: "'Jua', Impact, sans-serif", label: "주아 · 둥글둥글 강조 · 캡션" },
  { id: "'Do Hyeon', Impact, sans-serif", label: "도현 · SFX · 강조" },
  { id: "'Black Han Sans', Impact, sans-serif", label: "검은고딕 · 강한 SFX · 제목" },
  { id: "'Gugi', Impact, sans-serif", label: "구기 · 개성 강조" },
  { id: "'Cafe24 Ssurround', 'Malgun Gothic', sans-serif", label: "카페24 써라운드 · 둥근 · 굵은 강조" },
  { id: "'Jalnan', 'Malgun Gothic', sans-serif", label: "잘난체 · 굵은 제목" },
  { id: "'Tmoney Round Wind', 'Malgun Gothic', sans-serif", label: "티머니 둥근바람 · 둥근 제목" },
  { id: "'Nanum Square Round', 'Malgun Gothic', sans-serif", label: "나눔 스퀘어라운드 · 깔끔" },
  { id: "'SUITE', 'Malgun Gothic', sans-serif", label: "스위트 · 단정한 산세리프" },
  { id: "'Cafe24 Ssurround Air', 'Malgun Gothic', sans-serif", label: "카페24 써라운드 에어 · 얇은 강조" },
  { id: "'Binggre', 'Malgun Gothic', sans-serif", label: "빙그레체 · 둥근 브랜드체" },
  { id: "'Hakgyoansim Allimjang', 'Malgun Gothic', sans-serif", label: "학교안심 알림장 · 안내문" },
  { id: "'OngleipParkDahyeon', 'Comic Sans MS', cursive", label: "온글잎 박다현체 · 단정한 손글씨" },
  { id: "'KyoboHandwriting2019', 'Comic Sans MS', cursive", label: "교보손글씨 2019 · 자연스러운 손글씨" },
  { id: "'IsYun', 'Comic Sans MS', cursive", label: "이서윤체 · 또렷한 손글씨" },
  { id: "'GriunCherry1Spoon', 'Comic Sans MS', cursive", label: "그리운 체리한스푼 · 동글 손글씨" },
  { id: "'GriunCocochoitoon', 'Comic Sans MS', cursive", label: "그리운 코코초이툰 · 자연스러운 손글씨" },
  { id: "'GriunMyoeunHeullim', 'Comic Sans MS', cursive", label: "그리운 묘은흘림체 · 감성 흘림체" },
  { id: "'KyoboHandwriting2025', 'Comic Sans MS', cursive", label: "교보손글씨 2025 · 이유빈" },
  { id: "'IBM Plex Sans KR', 'Malgun Gothic', sans-serif", label: "추가 · IBM 플렉스" },
  { id: "'Sunflower', 'Malgun Gothic', sans-serif", label: "추가 · 선플라워" },
  { id: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", label: "추가 · 시스템 고딕" },
  { id: "'Gowun Batang', 'Batang', serif", label: "추가 · 고운바탕" },
  { id: "'Hahmlet', 'Batang', serif", label: "추가 · 함렛" },
  { id: "'Diphylleia', 'Batang', serif", label: "추가 · 산하엽" },
  { id: "'Single Day', 'Comic Sans MS', cursive", label: "추가 · 싱글데이" },
  { id: "'East Sea Dokdo', Impact, cursive", label: "추가 · 동해독도" },
  { id: "'Dokdo', Impact, cursive", label: "추가 · 독도" },
  { id: "'Kirang Haerang', Impact, cursive", label: "추가 · 기랑해랑" },
  { id: "'Cute Font', 'Comic Sans MS', cursive", label: "추가 · 큐트폰트" },
  { id: "'Bagel Fat One', Impact, sans-serif", label: "추가 · 베이글팻원" },
  { id: "'Stylish', Impact, sans-serif", label: "추가 · 스타일리시" },
  { id: "'Grandiflora One', Impact, sans-serif", label: "추가 · 그랜디플로라" },
  { id: "'Orbit', Impact, sans-serif", label: "추가 · 오르빗" },
  { id: "monospace", label: "기타 · 고정폭" },
] as const;

export function createBubble(type: BubbleType, x: number, y: number): SpeechBubble {
  const speechPreset = getSpeechBubblePreset(type);
  const hasTail = speechPreset?.tailEnabled ?? false;
  const isText = type === "text";
  const isShape = ["rectangle", "roundedRectangle", "ellipse", "line", "arrow", "star"].includes(type);
  const isLine = type === "line" || type === "arrow";
  return {
    id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type, x, y,
    width: isText ? 260 : isShape ? 180 : 200,
    height: isText ? 90 : isLine ? 40 : isShape ? 120 : 140,
    fillColor: isText || isLine ? "transparent" : "#ffffff",
    strokeColor: isText ? "transparent" : "#000000",
    strokeWidth: type === "needle" ? 2 : isText ? 0 : isShape ? 3 : speechPreset?.strokeWidth ?? 2.5,
    opacity: 1,
    tailEnabled: hasTail,
    tailTipX: x,
    tailTipY: y + 120,
    tailWidth: 24,
    text: isText ? "텍스트" : "",
    textColor: "#111111",
    fontSize: 24,
    fontWeight: "normal",
    textAlign: "center",
    strokeStyle: speechPreset?.strokeStyle ?? "solid",
    cornerRadius: 24,
    gradientStop: 50,
    gradientAngle: 0,
    roughness: speechPreset && "roughness" in speechPreset ? speechPreset.roughness : 0,
    wobble: speechPreset && "wobble" in speechPreset ? speechPreset.wobble : 0,
    fillOpacity: 1,
    strokeOpacity: 1,
    rotation: 0,
  };
}

export function drawBubble(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.save();
  ctx.globalAlpha *= b.opacity;
  if (b.rotation) {
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation * Math.PI / 180);
    ctx.translate(-b.x, -b.y);
  }
  switch (b.type) {
    case "classic": drawClassic(ctx, b); break;
    case "soft": drawSoft(ctx, b); break;
    case "whisper": drawClassic(ctx, b); break;
    case "wavy": drawWavy(ctx, b); break;
    case "thought": drawThought(ctx, b); break;
    case "radialThought": drawRadialThought(ctx, b); break;
    case "spiky":   drawSpiky(ctx, b); break;
    case "angry":   drawAngry(ctx, b); break;
    case "needle":  drawNeedle(ctx, b); break;
    case "electric": drawElectric(ctx, b); break;
    case "broadcast": drawBroadcast(ctx, b); break;
    case "double": drawDouble(ctx, b); break;
    case "text": break;
    case "rectangle": drawRectangle(ctx, b); break;
    case "roundedRectangle": drawRoundedRectangle(ctx, b); break;
    case "ellipse": drawEllipse(ctx, b); break;
    case "line": drawLine(ctx, b); break;
    case "arrow": drawArrow(ctx, b); break;
    case "cloud": drawCloud(ctx, b); break;
    case "star": drawStar(ctx, b); break;
  }
  if (b.text?.trim()) drawBubbleText(ctx, b);
  ctx.restore();
}

function drawRoundedRectangle(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const radius = Math.max(0, Math.min(bubble.cornerRadius ?? 24, bubble.width / 2, bubble.height / 2));
  traceRectangleWithTail(ctx, bubble, radius);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawRectangle(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  traceRectangleWithTail(ctx, bubble, 0);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function traceRectangleWithTail(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  radius: number
) {
  const left = bubble.x - bubble.width / 2;
  const right = bubble.x + bubble.width / 2;
  const top = bubble.y - bubble.height / 2;
  const bottom = bubble.y + bubble.height / 2;
  const dx = bubble.tailTipX - bubble.x;
  const dy = bubble.tailTipY - bubble.y;
  const horizontalScore = Math.abs(dx) / Math.max(1, bubble.width / 2);
  const verticalScore = Math.abs(dy) / Math.max(1, bubble.height / 2);
  const tailSide = !bubble.tailEnabled
    ? null
    : horizontalScore > verticalScore
      ? dx >= 0 ? "right" : "left"
      : dy >= 0 ? "bottom" : "top";
  const halfTail = Math.max(3, bubble.tailWidth / 2);
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, value));
  const horizontalBase = clamp(
    bubble.tailTipX,
    left + radius + halfTail,
    right - radius - halfTail
  );
  const verticalBase = clamp(
    bubble.tailTipY,
    top + radius + halfTail,
    bottom - radius - halfTail
  );

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  if (tailSide === "top") {
    ctx.lineTo(horizontalBase - halfTail, top);
    ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
    ctx.lineTo(horizontalBase + halfTail, top);
  }
  ctx.lineTo(right - radius, top);
  if (radius) ctx.quadraticCurveTo(right, top, right, top + radius);
  else ctx.lineTo(right, top);
  if (tailSide === "right") {
    ctx.lineTo(right, verticalBase - halfTail);
    ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
    ctx.lineTo(right, verticalBase + halfTail);
  }
  ctx.lineTo(right, bottom - radius);
  if (radius) ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  else ctx.lineTo(right, bottom);
  if (tailSide === "bottom") {
    ctx.lineTo(horizontalBase + halfTail, bottom);
    ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
    ctx.lineTo(horizontalBase - halfTail, bottom);
  }
  ctx.lineTo(left + radius, bottom);
  if (radius) ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
  else ctx.lineTo(left, bottom);
  if (tailSide === "left") {
    ctx.lineTo(left, verticalBase + halfTail);
    ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
    ctx.lineTo(left, verticalBase - halfTail);
  }
  ctx.lineTo(left, top + radius);
  if (radius) ctx.quadraticCurveTo(left, top, left + radius, top);
  else ctx.lineTo(left, top);
  ctx.closePath();
}

function drawEllipse(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  drawClassic(ctx, bubble);
}

function drawLine(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  ctx.beginPath();
  ctx.moveTo(bubble.x - bubble.width / 2, bubble.y);
  ctx.lineTo(bubble.x + bubble.width / 2, bubble.y);
  doStroke(ctx, bubble);
}

function drawArrow(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const left = bubble.x - bubble.width / 2;
  const right = bubble.x + bubble.width / 2;
  const head = Math.max(12, Math.min(bubble.height * 0.7, bubble.width * 0.28));
  ctx.beginPath();
  ctx.moveTo(left, bubble.y);
  ctx.lineTo(right, bubble.y);
  ctx.moveTo(right - head, bubble.y - head * 0.65);
  ctx.lineTo(right, bubble.y);
  ctx.lineTo(right - head, bubble.y + head * 0.65);
  doStroke(ctx, bubble);
}

type BubblePoint = { x: number; y: number };

const ORGANIC_RADII = [
  0.98, 1.01, 0.99, 1.02, 1, 0.98, 1.01, 0.97,
  1.02, 1, 0.98, 1.01, 0.97, 1, 1.02, 0.98,
  1, 1.02, 0.97, 1.01, 0.99, 1.02, 0.98, 1,
] as const;

const WAVY_RADII = [
  0.94, 1.04, 0.91, 1.06, 0.95, 1.03, 0.9, 1.07,
  0.93, 1.05, 0.89, 1.04, 0.94, 1.08, 0.91, 1.03,
  0.95, 1.06, 0.9, 1.04,
] as const;

const CLOUD_MASTER_START = [180, 36] as const;
const CLOUD_MASTER_SEGMENTS = [
  [[192, 8], [224, 12], [232, 42]],
  [[251, 22], [285, 37], [277, 67]],
  [[313, 56], [334, 89], [302, 105]],
  [[334, 117], [321, 153], [282, 145]],
  [[292, 183], [253, 198], [238, 168]],
  [[226, 205], [193, 207], [188, 173]],
  [[169, 205], [139, 194], [139, 167]],
  [[120, 182], [98, 169], [80, 144]],
  [[45, 166], [18, 131], [54, 105]],
  [[24, 93], [42, 51], [75, 67]],
  [[73, 30], [111, 18], [124, 47]],
  [[137, 15], [170, 12], [180, 36]],
] as const;

const SHOUT_RADII = [
  1.08, 0.72, 0.98, 0.68, 1.12, 0.75, 1.02, 0.69,
  1.09, 0.73, 1.01, 0.67, 1.11, 0.76, 0.99, 0.7,
  1.08, 0.74, 1.03, 0.69, 1.1, 0.72, 0.97, 0.68,
] as const;

const SCREAM_RADII = [
  1.22, 0.58, 0.98, 0.64, 1.18, 0.55, 1.08, 0.62,
  1.25, 0.57, 1.02, 0.65, 1.2, 0.54, 1.1, 0.6,
  1.24, 0.56, 0.99, 0.64, 1.19, 0.55, 1.07, 0.61,
] as const;

const ELECTRIC_POINTS = [
  [0.077, 0.092], [0.206, 0.092], [0.25, 0], [0.301, 0.092], [0.426, 0.092],
  [0.482, 0], [0.537, 0.092], [0.684, 0.092], [0.735, 0], [0.787, 0.092], [0.934, 0.092],
  [0.934, 0.264], [1, 0.333], [0.934, 0.414], [0.934, 0.609], [1, 0.678],
  [0.934, 0.747], [0.934, 0.897], [0.757, 0.897], [0.706, 1], [0.654, 0.897],
  [0.463, 0.897], [0.408, 1], [0.353, 0.897], [0.191, 0.897], [0.066, 0.897],
  [0.066, 0.724], [0, 0.655], [0.066, 0.586], [0.066, 0.391], [0, 0.322], [0.066, 0.253],
] as const;

function midpoint(a: BubblePoint, b: BubblePoint): BubblePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function lerpPoint(a: BubblePoint, b: BubblePoint, amount: number): BubblePoint {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

function quadraticPoint(a: BubblePoint, control: BubblePoint, b: BubblePoint, amount: number): BubblePoint {
  const first = lerpPoint(a, control, amount);
  const second = lerpPoint(control, b, amount);
  return lerpPoint(first, second, amount);
}

function cubicPoint(
  start: BubblePoint,
  firstControl: BubblePoint,
  secondControl: BubblePoint,
  end: BubblePoint,
  amount: number
) {
  const first = lerpPoint(start, firstControl, amount);
  const second = lerpPoint(firstControl, secondControl, amount);
  const third = lerpPoint(secondControl, end, amount);
  const fourth = lerpPoint(first, second, amount);
  const fifth = lerpPoint(second, third, amount);
  return lerpPoint(fourth, fifth, amount);
}

function mapCloudMasterPoint(
  bubble: SpeechBubble,
  point: readonly [number, number],
  seed: number
): BubblePoint {
  const roughness = Math.max(0, Math.min(1, bubble.roughness ?? 0));
  const wobble = Math.max(0, Math.min(1, bubble.wobble ?? 0));
  const radialScale = 1
    + Math.sin(seed * 2.17 + 0.7) * roughness * 0.035
    + Math.sin(seed * 1.31 + 1.9) * wobble * 0.025;
  const normalizedX = (point[0] - 176) / 316;
  const normalizedY = (point[1] - 107.5) / 199;
  return {
    x: bubble.x + normalizedX * bubble.width * radialScale,
    y: bubble.y + normalizedY * bubble.height * radialScale,
  };
}

function traceCloudMasterOutline(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  tailEnabled = bubble.tailEnabled
) {
  const start = mapCloudMasterPoint(bubble, CLOUD_MASTER_START, 0);
  const segments = CLOUD_MASTER_SEGMENTS.map(([firstControl, secondControl, end], index) => ({
    firstControl: mapCloudMasterPoint(bubble, firstControl, index * 3 + 1),
    secondControl: mapCloudMasterPoint(bubble, secondControl, index * 3 + 2),
    end: mapCloudMasterPoint(bubble, end, index * 3 + 3),
  }));

  let tailSegment = -1;
  if (tailEnabled) {
    const targetAngle = normalizedTailAngle(bubble);
    let closestDistance = Number.POSITIVE_INFINITY;
    let segmentStart = start;
    segments.forEach((segment, index) => {
      const center = cubicPoint(segmentStart, segment.firstControl, segment.secondControl, segment.end, 0.5);
      const angle = Math.atan2(
        (center.y - bubble.y) / Math.max(1, bubble.height),
        (center.x - bubble.x) / Math.max(1, bubble.width)
      );
      const distance = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)));
      if (distance < closestDistance) {
        tailSegment = index;
        closestDistance = distance;
      }
      segmentStart = segment.end;
    });
  }

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  let segmentStart = start;
  segments.forEach((segment, index) => {
    if (index !== tailSegment) {
      ctx.bezierCurveTo(
        segment.firstControl.x,
        segment.firstControl.y,
        segment.secondControl.x,
        segment.secondControl.y,
        segment.end.x,
        segment.end.y
      );
      segmentStart = segment.end;
      return;
    }

    const approximateLength = Math.hypot(segment.firstControl.x - segmentStart.x, segment.firstControl.y - segmentStart.y)
      + Math.hypot(segment.secondControl.x - segment.firstControl.x, segment.secondControl.y - segment.firstControl.y)
      + Math.hypot(segment.end.x - segment.secondControl.x, segment.end.y - segment.secondControl.y);
    const halfSpan = Math.max(0.16, Math.min(0.42, bubble.tailWidth / Math.max(18, approximateLength * 2)));
    const startAmount = 0.5 - halfSpan;
    const endAmount = 0.5 + halfSpan;

    const firstA = lerpPoint(segmentStart, segment.firstControl, startAmount);
    const firstB = lerpPoint(segment.firstControl, segment.secondControl, startAmount);
    const firstC = lerpPoint(segment.secondControl, segment.end, startAmount);
    const firstD = lerpPoint(firstA, firstB, startAmount);
    const firstE = lerpPoint(firstB, firstC, startAmount);
    const baseStart = lerpPoint(firstD, firstE, startAmount);

    const lastA = lerpPoint(segmentStart, segment.firstControl, endAmount);
    const lastB = lerpPoint(segment.firstControl, segment.secondControl, endAmount);
    const lastC = lerpPoint(segment.secondControl, segment.end, endAmount);
    const lastD = lerpPoint(lastA, lastB, endAmount);
    const lastE = lerpPoint(lastB, lastC, endAmount);
    const baseEnd = lerpPoint(lastD, lastE, endAmount);

    ctx.bezierCurveTo(firstA.x, firstA.y, firstD.x, firstD.y, baseStart.x, baseStart.y);
    ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
    ctx.lineTo(baseEnd.x, baseEnd.y);
    ctx.bezierCurveTo(lastE.x, lastE.y, lastC.x, lastC.y, segment.end.x, segment.end.y);
    segmentStart = segment.end;
  });
  ctx.closePath();
}

function normalizedTailAngle(bubble: SpeechBubble) {
  return Math.atan2(
    (bubble.tailTipY - bubble.y) / Math.max(1, bubble.height),
    (bubble.tailTipX - bubble.x) / Math.max(1, bubble.width)
  );
}

function closestAngleIndex(count: number, targetAngle: number) {
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const distance = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)));
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  }
  return closest;
}

function radialPoints(bubble: SpeechBubble, radii: readonly number[]) {
  return radii.map((radius, index) => {
    const angle = -Math.PI / 2 + (index / radii.length) * Math.PI * 2;
    return {
      x: bubble.x + Math.cos(angle) * bubble.width * 0.5 * radius,
      y: bubble.y + Math.sin(angle) * bubble.height * 0.5 * radius,
    };
  });
}

function ellipsePerimeter(rx: number, ry: number) {
  const sum = Math.max(1, rx + ry);
  const h = ((rx - ry) ** 2) / (sum ** 2);
  return Math.PI * sum * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function ellipseArcAngles(rx: number, ry: number, count: number) {
  const steps = Math.max(720, count * 6);
  const cumulative = new Float64Array(steps + 1);
  let previousX = rx;
  let previousY = 0;

  for (let step = 1; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    cumulative[step] = cumulative[step - 1] + Math.hypot(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
  }

  const total = cumulative[steps];
  const angles: number[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index += 1) {
    const target = ((index + 0.37) / count) * total;
    while (cursor < steps && cumulative[cursor] < target) cursor += 1;
    const lower = cumulative[cursor - 1];
    const upper = cumulative[cursor];
    const amount = upper > lower ? (target - lower) / (upper - lower) : 0;
    angles.push(((cursor - 1 + amount) / steps) * Math.PI * 2);
  }
  return angles;
}

function stableBubbleSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function stableUnit(seed: number, index: number, channel: number) {
  let hash = (seed ^ Math.imul(index + 1, -1640531527) ^ Math.imul(channel + 1, -2048144789)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function distanceToOuterEllipse(
  point: BubblePoint,
  normal: BubblePoint,
  outerRx: number,
  outerRy: number
) {
  const inverseRxSquared = 1 / (outerRx * outerRx);
  const inverseRySquared = 1 / (outerRy * outerRy);
  const a = normal.x * normal.x * inverseRxSquared + normal.y * normal.y * inverseRySquared;
  const b = 2 * (
    point.x * normal.x * inverseRxSquared
    + point.y * normal.y * inverseRySquared
  );
  const c = point.x * point.x * inverseRxSquared + point.y * point.y * inverseRySquared - 1;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  return Math.max(1, (-b + Math.sqrt(discriminant)) / (2 * a));
}

function traceSmoothRadialOutline(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  radii: readonly number[],
  tailEnabled = bubble.tailEnabled
) {
  const points = radialPoints(bubble, radii);
  const tailIndex = tailEnabled ? closestAngleIndex(points.length, normalizedTailAngle(bubble)) : -1;
  let segmentStart = midpoint(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(segmentStart.x, segmentStart.y);

  for (let index = 0; index < points.length; index += 1) {
    const control = points[index];
    const segmentEnd = midpoint(control, points[(index + 1) % points.length]);
    if (index === tailIndex) {
      const approximateLength = Math.hypot(control.x - segmentStart.x, control.y - segmentStart.y)
        + Math.hypot(segmentEnd.x - control.x, segmentEnd.y - control.y);
      const halfSpan = Math.max(0.2, Math.min(0.46, bubble.tailWidth / Math.max(12, approximateLength * 2)));
      const startAmount = 0.5 - halfSpan;
      const endAmount = 0.5 + halfSpan;
      const baseStart = quadraticPoint(segmentStart, control, segmentEnd, startAmount);
      const baseEnd = quadraticPoint(segmentStart, control, segmentEnd, endAmount);
      const firstControl = lerpPoint(segmentStart, control, startAmount);
      const lastControl = lerpPoint(control, segmentEnd, endAmount);
      ctx.quadraticCurveTo(firstControl.x, firstControl.y, baseStart.x, baseStart.y);
      ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
      ctx.lineTo(baseEnd.x, baseEnd.y);
      ctx.quadraticCurveTo(lastControl.x, lastControl.y, segmentEnd.x, segmentEnd.y);
    } else {
      ctx.quadraticCurveTo(control.x, control.y, segmentEnd.x, segmentEnd.y);
    }
    segmentStart = segmentEnd;
  }
  ctx.closePath();
}

function traceAngularRadialOutline(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  radii: readonly number[]
) {
  const points = radialPoints(bubble, radii);
  tracePolygonWithTail(ctx, bubble, points);
}

function tracePolygonWithTail(ctx: CanvasRenderingContext2D, bubble: SpeechBubble, points: readonly BubblePoint[]) {
  const targetAngle = normalizedTailAngle(bubble);
  let tailEdge = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  if (bubble.tailEnabled) {
    for (let index = 0; index < points.length; index += 1) {
      const center = midpoint(points[index], points[(index + 1) % points.length]);
      const angle = Math.atan2(
        (center.y - bubble.y) / Math.max(1, bubble.height),
        (center.x - bubble.x) / Math.max(1, bubble.width)
      );
      const distance = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)));
      if (distance < closestDistance) {
        closestDistance = distance;
        tailEdge = index;
      }
    }
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (index === tailEdge) {
      const edgeLength = Math.max(1, Math.hypot(next.x - current.x, next.y - current.y));
      const halfSpan = Math.max(0.18, Math.min(0.46, bubble.tailWidth / edgeLength / 2));
      const baseStart = lerpPoint(current, next, 0.5 - halfSpan);
      const baseEnd = lerpPoint(current, next, 0.5 + halfSpan);
      ctx.lineTo(baseStart.x, baseStart.y);
      ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
      ctx.lineTo(baseEnd.x, baseEnd.y);
    }
    ctx.lineTo(next.x, next.y);
  }
  ctx.closePath();
}

function drawSoft(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const radius = Math.min(bubble.width, bubble.height) * 0.43;
  traceRectangleWithTail(ctx, bubble, radius);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawWavy(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  traceSmoothRadialOutline(ctx, bubble, WAVY_RADII);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawCloud(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  traceCloudMasterOutline(ctx, bubble);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawElectric(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const points = ELECTRIC_POINTS.map(([x, y]) => ({
    x: bubble.x + (x - 0.5) * bubble.width,
    y: bubble.y + (y - 0.5) * bubble.height,
  }));
  tracePolygonWithTail(ctx, bubble, points);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawBroadcast(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  traceEllipseWithTail(ctx, bubble, true);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawDouble(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  traceEllipseWithTail(ctx, bubble, false);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);

  const inset = Math.max(5, bubble.strokeWidth * 2.2);
  if (bubble.width <= inset * 2 || bubble.height <= inset * 2) return;
  ctx.beginPath();
  ctx.ellipse(bubble.x, bubble.y, bubble.width / 2 - inset, bubble.height / 2 - inset, 0, 0, Math.PI * 2);
  doStroke(ctx, {
    ...bubble,
    strokeWidth: Math.max(1, bubble.strokeWidth * 0.62),
    strokeOpacity: Math.min(1, (bubble.strokeOpacity ?? 1) * 0.72),
  });
}

function drawStar(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const outerX = bubble.width / 2;
  const outerY = bubble.height / 2;
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? 1 : 0.45;
    const x = bubble.x + Math.cos(angle) * outerX * radius;
    const y = bubble.y + Math.sin(angle) * outerY * radius;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function splitLongToken(ctx: CanvasRenderingContext2D, token: string, maxWidth: number) {
  const pieces: string[] = [];
  let current = "";
  for (const character of token) {
    if (current && ctx.measureText(current + character).width > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const pieces = ctx.measureText(word).width > maxWidth
        ? splitLongToken(ctx, word, maxWidth)
        : [word];
      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = piece;
        } else {
          line = candidate;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawBubbleText(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  const fontSize = Math.max(8, bubble.fontSize ?? 24);
  const padding = Math.max(10, fontSize * 0.65);
  const textAreaWidth = bubble.type === "radialThought" ? bubble.width * 0.68 : bubble.width;
  const textAreaHeight = bubble.type === "radialThought" ? bubble.height * 0.62 : bubble.height;
  const maxWidth = Math.max(20, textAreaWidth - padding * 2);
  const lineHeight = fontSize * (bubble.lineHeightScale ?? 1.28);
  const family = bubble.fontFamily || "sans-serif";
  const weight = bubble.fontWeight === "bold" ? 700 : bubble.fontWeight === "normal" || bubble.fontWeight === undefined ? 400 : bubble.fontWeight;
  const italic = bubble.fontItalic ? "italic " : "";
  ctx.font = `${italic}${weight} ${fontSize}px ${family}`;
  if (bubble.textRuns?.length) {
    drawRichBubbleText(ctx, bubble, {
      fontSize,
      padding,
      maxWidth,
      lineHeight,
      family,
      weight,
      textAreaWidth,
      textAreaHeight,
    });
    return;
  }
  // 자간(letterSpacing)은 최신 Canvas API. 지원 시에만 적용한다.
  const spacing = bubble.letterSpacing ?? 0;
  const ctxWithSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in ctx) ctxWithSpacing.letterSpacing = `${spacing}px`;
  ctx.fillStyle = bubble.textColor ?? "#111111";
  ctx.textAlign = bubble.textAlign ?? "center";
  ctx.textBaseline = "middle";
  const lines = wrapText(ctx, bubble.text ?? "", maxWidth);
  const visibleLines = lines.slice(0, Math.max(1, Math.floor((textAreaHeight - padding) / lineHeight)));
  const startY = bubble.y - ((visibleLines.length - 1) * lineHeight) / 2 + (bubble.baselineOffset ?? 0);
  const textX = bubble.textAlign === "left"
    ? bubble.x - textAreaWidth / 2 + padding
    : bubble.textAlign === "right"
      ? bubble.x + textAreaWidth / 2 - padding
      : bubble.x;
  const hasOutline = Boolean(bubble.outlineColor && (bubble.outlineWidth ?? 0) > 0);
  visibleLines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    if (hasOutline) {
      ctx.strokeStyle = bubble.outlineColor!;
      ctx.lineWidth = bubble.outlineWidth!;
      ctx.lineJoin = "round";
      ctx.strokeText(line, textX, y, maxWidth);
    }
    ctx.fillText(line, textX, y, maxWidth);
    if (bubble.underline && line) {
      const width = Math.min(maxWidth, ctx.measureText(line).width);
      const ux = bubble.textAlign === "left" ? textX
        : bubble.textAlign === "right" ? textX - width
          : textX - width / 2;
      ctx.beginPath();
      ctx.strokeStyle = bubble.textColor ?? "#111111";
      ctx.lineWidth = Math.max(1, fontSize * 0.06);
      ctx.moveTo(ux, y + fontSize * 0.55);
      ctx.lineTo(ux + width, y + fontSize * 0.55);
      ctx.stroke();
    }
  });
  if ("letterSpacing" in ctx) ctxWithSpacing.letterSpacing = "0px";
}

function drawRichBubbleText(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  metrics: {
    fontSize: number;
    padding: number;
    maxWidth: number;
    lineHeight: number;
    family: string;
    weight: number;
    textAreaWidth: number;
    textAreaHeight: number;
  }
) {
  const text = bubble.text ?? "";
  const spacing = bubble.letterSpacing ?? 0;
  type Glyph = {
    character: string;
    width: number;
    style: TextStyleRun;
  };
  const lines: Glyph[][] = [[]];
  const lineWidths: number[] = [0];
  const styleAt = (index: number): TextStyleRun => {
    const matching = bubble.textRuns!.filter((run) => index >= run.start && index < run.end);
    return matching.reduce<TextStyleRun>((combined, run) => ({ ...combined, ...run }), {} as TextStyleRun);
  };
  const setFont = (style: TextStyleRun) => {
    const runWeight = style.fontWeight === "bold"
      ? 700
      : style.fontWeight === "normal" || style.fontWeight === undefined
        ? metrics.weight
        : style.fontWeight;
    const runItalic = style.fontItalic ?? bubble.fontItalic;
    ctx.font = `${runItalic ? "italic " : ""}${runWeight} ${metrics.fontSize}px ${metrics.family}`;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\n") {
      lines.push([]);
      lineWidths.push(0);
      continue;
    }
    const style = styleAt(index);
    setFont(style);
    const width = ctx.measureText(character).width + spacing;
    let lineIndex = lines.length - 1;
    if (lineWidths[lineIndex] > 0 && lineWidths[lineIndex] + width > metrics.maxWidth) {
      lines.push([]);
      lineWidths.push(0);
      lineIndex += 1;
    }
    lines[lineIndex].push({ character, width, style });
    lineWidths[lineIndex] += width;
  }

  const maxLines = Math.max(1, Math.floor((metrics.textAreaHeight - metrics.padding) / metrics.lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const startY = bubble.y - ((visibleLines.length - 1) * metrics.lineHeight) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  visibleLines.forEach((line, lineIndex) => {
    const width = lineWidths[lineIndex];
    let x = bubble.textAlign === "left"
      ? bubble.x - metrics.textAreaWidth / 2 + metrics.padding
      : bubble.textAlign === "right"
        ? bubble.x + metrics.textAreaWidth / 2 - metrics.padding - width
        : bubble.x - width / 2;
    const baseY = startY + lineIndex * metrics.lineHeight;
    for (const glyph of line) {
      setFont(glyph.style);
      const y = baseY + (glyph.style.baselineOffset ?? bubble.baselineOffset ?? 0);
      const textColor = glyph.style.textColor ?? bubble.textColor ?? "#111111";
      if (bubble.outlineColor && (bubble.outlineWidth ?? 0) > 0) {
        ctx.strokeStyle = bubble.outlineColor;
        ctx.lineWidth = bubble.outlineWidth!;
        ctx.lineJoin = "round";
        ctx.strokeText(glyph.character, x, y);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(glyph.character, x, y);
      if (glyph.style.underline ?? bubble.underline) {
        ctx.beginPath();
        ctx.strokeStyle = textColor;
        ctx.lineWidth = Math.max(1, metrics.fontSize * 0.06);
        ctx.moveTo(x, y + metrics.fontSize * 0.55);
        ctx.lineTo(x + Math.max(0, glyph.width - spacing), y + metrics.fontSize * 0.55);
        ctx.stroke();
      }
      x += glyph.width;
    }
  });
}

export function drawBubbleSelection(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const left = b.x - b.width / 2;
  const top = b.y - b.height / 2;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate((b.rotation ?? 0) * Math.PI / 180);
  ctx.translate(-b.x, -b.y);
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(left, top, b.width, b.height);
  ctx.restore();

  const rotationHandle = getRotationHandlePosition(b);
  const rotationAnchor = bubblePointToCanvas(b, b.x, top);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(rotationAnchor.x, rotationAnchor.y);
  ctx.lineTo(rotationHandle.x, rotationHandle.y);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rotationHandle.x, rotationHandle.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#f59e0b";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.setLineDash([]);
  for (const h of getHandlePositions(b)) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    ctx.fillRect(h.x - 5, h.y - 5, 10, 10);
    ctx.strokeRect(h.x - 5, h.y - 5, 10, 10);
  }
  if (b.tailEnabled) {
    const tail = bubblePointToCanvas(b, b.tailTipX, b.tailTipY);
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function getHandlePositions(b: SpeechBubble) {
  const l = b.x - b.width / 2, r = b.x + b.width / 2;
  const t = b.y - b.height / 2, bt = b.y + b.height / 2;
  return ([
    { id: "nw", x: l, y: t }, { id: "n", x: b.x, y: t },
    { id: "ne", x: r, y: t }, { id: "e", x: r, y: b.y },
    { id: "se", x: r, y: bt }, { id: "s", x: b.x, y: bt },
    { id: "sw", x: l, y: bt }, { id: "w", x: l, y: b.y },
  ]).map((handle) => ({ ...handle, ...bubblePointToCanvas(b, handle.x, handle.y) }));
}

export function hitTestBubble(mx: number, my: number, b: SpeechBubble): "body" | "tail" | string | null {
  const rotationHandle = getRotationHandlePosition(b);
  if (Math.hypot(mx - rotationHandle.x, my - rotationHandle.y) < 14) return "rotate";
  const tail = bubblePointToCanvas(b, b.tailTipX, b.tailTipY);
  if (b.tailEnabled && Math.hypot(mx - tail.x, my - tail.y) < 14) return "tail";
  for (const h of getHandlePositions(b)) {
    if (Math.abs(mx - h.x) < 10 && Math.abs(my - h.y) < 10) return h.id;
  }
  const local = canvasPointToBubble(b, mx, my);
  const l = b.x - b.width / 2, t = b.y - b.height / 2;
  if (local.x >= l && local.x <= l + b.width && local.y >= t && local.y <= t + b.height) return "body";
  return null;
}

export function bubblePointToCanvas(b: SpeechBubble, x: number, y: number) {
  const radians = (b.rotation ?? 0) * Math.PI / 180;
  const dx = x - b.x;
  const dy = y - b.y;
  return {
    x: b.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: b.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function canvasPointToBubble(b: SpeechBubble, x: number, y: number) {
  const radians = -(b.rotation ?? 0) * Math.PI / 180;
  const dx = x - b.x;
  const dy = y - b.y;
  return {
    x: b.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: b.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function getRotationHandlePosition(b: SpeechBubble) {
  return bubblePointToCanvas(b, b.x, b.y - b.height / 2 - 28);
}

// ═══════════════ 유틸 ═══════════════

function doFill(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  if (b.fillColor === "transparent") return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, b.fillOpacity ?? 1));
  if (b.gradientColor) {
    const angle = ((b.gradientAngle ?? 0) * Math.PI) / 180;
    const radius = Math.hypot(b.width, b.height) / 2;
    const gradient = ctx.createLinearGradient(
      b.x - Math.cos(angle) * radius,
      b.y - Math.sin(angle) * radius,
      b.x + Math.cos(angle) * radius,
      b.y + Math.sin(angle) * radius
    );
    const stop = Math.max(0.05, Math.min(0.95, (b.gradientStop ?? 50) / 100));
    gradient.addColorStop(0, b.fillColor);
    gradient.addColorStop(stop, b.fillColor);
    gradient.addColorStop(1, b.gradientColor);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = b.fillColor;
  }
  ctx.fill();
  ctx.restore();
}
function doStroke(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  if (b.strokeColor === "transparent" || b.strokeWidth <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, b.strokeOpacity ?? 1));
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  ctx.lineCap = b.strokeStyle === "dotted" ? "round" : "butt";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2.5;
  if (b.strokeStyle === "dashed") ctx.setLineDash([b.strokeWidth * 4, b.strokeWidth * 2.5]);
  if (b.strokeStyle === "dotted") ctx.setLineDash([0, b.strokeWidth * 2.5]);
  ctx.stroke();
  if (b.strokeStyle === "rough") {
    ctx.globalAlpha *= 0.45;
    ctx.translate(Math.max(0.6, b.strokeWidth * 0.2), Math.max(0.4, b.strokeWidth * 0.12));
    ctx.lineWidth = Math.max(0.8, b.strokeWidth * 0.65);
    ctx.stroke();
  }
  ctx.restore();
}

// ═══════════════ 1. classic (타원 + 꼬리, 연결부 선 없음) ═══════════════

function drawClassic(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  traceSmoothRadialOutline(ctx, b, ORGANIC_RADII);
  doFill(ctx, b);
  doStroke(ctx, b);
}

function traceEllipseWithTail(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  lightningTail: boolean
) {
  const rx = Math.max(1, bubble.width / 2);
  const ry = Math.max(1, bubble.height / 2);
  ctx.beginPath();
  if (!bubble.tailEnabled) {
    ctx.ellipse(bubble.x, bubble.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  const dx = bubble.tailTipX - bubble.x;
  const dy = bubble.tailTipY - bubble.y;
  const angle = Math.atan2(dy / ry, dx / rx);
  const spread = Math.max(0.07, Math.min(0.42, bubble.tailWidth / Math.max(24, Math.min(bubble.width, bubble.height))));
  const startAngle = angle + spread;
  const endAngle = angle - spread;
  ctx.ellipse(bubble.x, bubble.y, rx, ry, 0, startAngle, endAngle + Math.PI * 2);

  if (lightningTail) {
    const baseStart = {
      x: bubble.x + Math.cos(endAngle) * rx,
      y: bubble.y + Math.sin(endAngle) * ry,
    };
    const baseEnd = {
      x: bubble.x + Math.cos(startAngle) * rx,
      y: bubble.y + Math.sin(startAngle) * ry,
    };
    const baseMiddle = midpoint(baseStart, baseEnd);
    const distance = Math.max(1, Math.hypot(bubble.tailTipX - baseMiddle.x, bubble.tailTipY - baseMiddle.y));
    const perpendicular = {
      x: -(bubble.tailTipY - baseMiddle.y) / distance,
      y: (bubble.tailTipX - baseMiddle.x) / distance,
    };
    const zigzag = Math.max(3, Math.min(bubble.tailWidth * 0.22, distance * 0.16));
    const first = lerpPoint(baseMiddle, { x: bubble.tailTipX, y: bubble.tailTipY }, 0.32);
    const second = lerpPoint(baseMiddle, { x: bubble.tailTipX, y: bubble.tailTipY }, 0.55);
    const third = lerpPoint(baseMiddle, { x: bubble.tailTipX, y: bubble.tailTipY }, 0.76);
    ctx.lineTo(first.x + perpendicular.x * zigzag, first.y + perpendicular.y * zigzag);
    ctx.lineTo(second.x - perpendicular.x * zigzag, second.y - perpendicular.y * zigzag);
    ctx.lineTo(third.x + perpendicular.x * zigzag * 0.7, third.y + perpendicular.y * zigzag * 0.7);
  }
  ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
  ctx.closePath();
}

// ═══════════════ 2. thought (타원 + 원 3개 꼬리, 바운딩 박스 바깥) ═══════════════

function drawThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 구름 본체와 생각 방울은 의도적으로 분리된 만화 문법이다.
  traceCloudMasterOutline(ctx, b, false);
  doFill(ctx, b);
  doStroke(ctx, b);

  if (b.tailEnabled) {
    const dx = b.tailTipX - b.x;
    const dy = b.tailTipY - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      const nx = dx / dist;
      const ny = dy / dist;

      const baseSize = Math.min(rx, ry);
      const sizes = [
        Math.max(6, baseSize * 0.13),
        Math.max(4.5, baseSize * 0.09),
        Math.max(3.5, baseSize * 0.065),
      ];

      const boundaryDistance = 1 / Math.sqrt((nx * nx) / (rx * rx) + (ny * ny) / (ry * ry));
      let currentDist = boundaryDistance + sizes[0] * 1.45;
      for (let i = 0; i < 3; i++) {
        const cx = b.x + nx * currentDist;
        const cy = b.y + ny * currentDist;
        ctx.beginPath();
        ctx.arc(cx, cy, sizes[i], 0, Math.PI * 2);
        doFill(ctx, b);
        doStroke(ctx, b);
        const nextSize = sizes[i + 1] ?? 0;
        currentDist += sizes[i] + nextSize + Math.max(4, baseSize * 0.055);
      }
    }
  }
}

// 집중선 속마음: 각 선의 중심을 가상 타원에 놓고 안쪽은 희미하게, 바깥쪽은 날카롭게 뻗는다.
function drawRadialThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const outerRx = Math.max(8, b.width / 2);
  const outerRy = Math.max(8, b.height / 2);
  const guideRx = outerRx * 0.74;
  const guideRy = outerRy * 0.7;

  ctx.save();
  ctx.filter = "blur(0.7px)";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, Math.max(1, guideRx - 0.7), Math.max(1, guideRy - 0.7), 0, 0, Math.PI * 2);
  ctx.closePath();
  doFill(ctx, b);
  ctx.restore();

  if (b.strokeColor === "transparent" || b.strokeWidth <= 0) return;

  const roughness = Math.max(0, Math.min(1, b.roughness ?? 0.28));
  const wobble = Math.max(0, Math.min(1, b.wobble ?? 0.12));
  const spacing = Math.max(1.05, Math.min(1.55, 1.08 + b.strokeWidth * 0.22));
  const lineCount = Math.max(180, Math.min(720, Math.round(ellipsePerimeter(guideRx, guideRy) / spacing)));
  const baseAngles = ellipseArcAngles(guideRx, guideRy, lineCount);
  const seed = stableBubbleSeed(b.id);
  const rays = baseAngles.map((baseAngle, index) => {
    const jitter = (stableUnit(seed, index, 0) - 0.5) * (Math.PI * 2 / lineCount) * wobble * 0.55;
    const angle = baseAngle + jitter;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rawNormal = { x: cosine / guideRx, y: sine / guideRy };
    const normalLength = Math.max(0.0001, Math.hypot(rawNormal.x, rawNormal.y));
    const normal = { x: rawNormal.x / normalLength, y: rawNormal.y / normalLength };
    const tangent = { x: -normal.y, y: normal.x };
    const guideOffset = (stableUnit(seed, index, 1) - 0.5) * wobble * 0.9;
    const guide = {
      x: b.x + cosine * guideRx + normal.x * guideOffset,
      y: b.y + sine * guideRy + normal.y * guideOffset,
    };
    const relativeGuide = { x: guide.x - b.x, y: guide.y - b.y };
    const availableLength = distanceToOuterEllipse(relativeGuide, normal, outerRx, outerRy);
    const lengthFactor = Math.max(
      0.5,
      Math.min(
        0.99,
        0.66
          + stableUnit(seed, index, 2) * 0.26
          + (stableUnit(seed, index, 3) - 0.5) * roughness * 0.24
      )
    );
    const inwardLength = Math.max(2.2, Math.min(7.5, Math.min(outerRx, outerRy) * (0.035 + stableUnit(seed, index, 4) * 0.035)));
    const sharpInset = 0.65 + stableUnit(seed, index, 5) * 1.15;
    const width = Math.max(0.18, b.strokeWidth * (0.34 + stableUnit(seed, index, 6) * 0.34));
    return {
      guide,
      normal,
      tangent,
      inwardLength,
      sharpInset,
      halfWidth: width * 0.5,
      end: {
        x: guide.x + normal.x * availableLength * lengthFactor,
        y: guide.y + normal.y * availableLength * lengthFactor,
      },
    };
  });

  // The faint inner half breaks the cut-out look without drawing a real ellipse border.
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, b.strokeOpacity ?? 1)) * 0.11;
  ctx.filter = "blur(0.65px)";
  ctx.fillStyle = b.strokeColor;
  ctx.beginPath();
  for (const ray of rays) {
    const innerTip = {
      x: ray.guide.x - ray.normal.x * ray.inwardLength,
      y: ray.guide.y - ray.normal.y * ray.inwardLength,
    };
    const blurHalfWidth = Math.max(0.22, ray.halfWidth * 1.35);
    ctx.moveTo(innerTip.x, innerTip.y);
    ctx.lineTo(ray.guide.x + ray.tangent.x * blurHalfWidth, ray.guide.y + ray.tangent.y * blurHalfWidth);
    ctx.lineTo(ray.guide.x - ray.tangent.x * blurHalfWidth, ray.guide.y - ray.tangent.y * blurHalfWidth);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, b.strokeOpacity ?? 1)) * 0.88;
  ctx.fillStyle = b.strokeColor;
  ctx.beginPath();
  for (const ray of rays) {
    const innerTip = {
      x: ray.guide.x - ray.normal.x * ray.sharpInset,
      y: ray.guide.y - ray.normal.y * ray.sharpInset,
    };
    ctx.moveTo(innerTip.x, innerTip.y);
    ctx.lineTo(ray.guide.x + ray.tangent.x * ray.halfWidth, ray.guide.y + ray.tangent.y * ray.halfWidth);
    ctx.lineTo(ray.end.x, ray.end.y);
    ctx.lineTo(ray.guide.x - ray.tangent.x * ray.halfWidth, ray.guide.y - ray.tangent.y * ray.halfWidth);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

// ═══════════════ 3. spiky (비대칭 뾰족 외침) ═══════════════

function drawSpiky(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  traceAngularRadialOutline(ctx, b, SHOUT_RADII);
  doFill(ctx, b);
  doStroke(ctx, b);
}

// ═══════════════ 4. angry (화남 — 모든 선이 안쪽 오목 곡선, 꼭지점 뾰족) ═══════════════

function drawAngry(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  traceAngularRadialOutline(ctx, b, SCREAM_RADII);
  doFill(ctx, b);
  doStroke(ctx, b);
}

// ═══════════════ 5. needle (집중선 — 가상 타원 테두리 기준 안팎으로 뾰족) ═══════════════

function drawNeedle(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 600;
  // 크기에 비례하는 기본 길이 (확대해도 듬성듬성 안 됨)
  const baseLen = Math.min(rx, ry) * 0.35;

  ctx.fillStyle = b.strokeColor;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;

    const seed1 = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
    const seed2 = Math.sin(i * 269.5 + 183.3) * 0.5 + 0.5;
    const seed3 = Math.sin(i * 419.2 + 67.1) * 0.5 + 0.5;
    const seed4 = Math.sin(i * 337.9 + 521.3) * 0.5 + 0.5;

    // 중심점을 타원 테두리에서 ±10% 랜덤 오프셋
    const centerOffset = 1.0 + (seed4 - 0.5) * 0.2; // 0.9~1.1
    const centerX = b.x + Math.cos(angle) * rx * centerOffset;
    const centerY = b.y + Math.sin(angle) * ry * centerOffset;

    // 바깥쪽 끝 (크기 비례 + ±10% 랜덤)
    const outerLen = baseLen * (0.6 + seed1 * 0.8); // 0.6~1.4 × baseLen
    const outerX = centerX + Math.cos(angle) * outerLen;
    const outerY = centerY + Math.sin(angle) * outerLen;

    // 안쪽 끝 (크기 비례 + ±10% 랜덤)
    const innerLen = baseLen * (0.6 + seed2 * 0.8);
    const innerX = centerX - Math.cos(angle) * innerLen;
    const innerY = centerY - Math.sin(angle) * innerLen;

    // 중심부 폭 (크기에 비례)
    const midWidth = (0.4 + seed3 * 0.8) * b.strokeWidth * (Math.min(rx, ry) / 70);
    const perpX = -Math.sin(angle) * midWidth;
    const perpY = Math.cos(angle) * midWidth;

    // 방추형: 바깥 뾰족 → 중앙 넓음 → 안쪽 뾰족
    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.lineTo(centerX + perpX, centerY + perpY);
    ctx.lineTo(innerX, innerY);
    ctx.lineTo(centerX - perpX, centerY - perpY);
    ctx.closePath();
    ctx.fill();
  }
}
