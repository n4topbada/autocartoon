/**
 * 말풍선 Canvas 2D 드로잉 함수 (5종)
 */

export type BubbleType =
  | "classic"
  | "thought"
  | "spiky"
  | "angry"
  | "needle"
  | "text"
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "cloud"
  | "star";

export type BubbleStrokeStyle = "solid" | "dashed" | "dotted" | "rough";

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
}

export const BUBBLE_FONT_FAMILIES = [
  { id: "'Noto Sans KR', 'Malgun Gothic', sans-serif", label: "대사 · 노토 산스" },
  { id: "'Pretendard', 'Malgun Gothic', sans-serif", label: "대사 · 프리텐다드" },
  { id: "'IBM Plex Sans KR', 'Malgun Gothic', sans-serif", label: "대사 · IBM 플렉스" },
  { id: "'Gowun Dodum', 'Malgun Gothic', sans-serif", label: "대사 · 고운돋움" },
  { id: "'Sunflower', 'Malgun Gothic', sans-serif", label: "대사 · 선플라워" },
  { id: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", label: "대사 · 시스템 고딕" },
  { id: "'Noto Serif KR', 'Batang', serif", label: "내레이션 · 노토 명조" },
  { id: "'Nanum Myeongjo', 'Batang', serif", label: "내레이션 · 나눔명조" },
  { id: "'Song Myung', 'Batang', serif", label: "내레이션 · 송명" },
  { id: "'Gowun Batang', 'Batang', serif", label: "내레이션 · 고운바탕" },
  { id: "'Hahmlet', 'Batang', serif", label: "내레이션 · 함렛" },
  { id: "'Diphylleia', 'Batang', serif", label: "내레이션 · 산하엽" },
  { id: "'Nanum Pen Script', 'Comic Sans MS', cursive", label: "손글씨 · 나눔펜" },
  { id: "'Nanum Brush Script', 'Comic Sans MS', cursive", label: "손글씨 · 나눔붓" },
  { id: "'Gaegu', 'Comic Sans MS', cursive", label: "손글씨 · 개구" },
  { id: "'Poor Story', 'Comic Sans MS', cursive", label: "손글씨 · 푸어스토리" },
  { id: "'Gamja Flower', 'Comic Sans MS', cursive", label: "손글씨 · 감자꽃" },
  { id: "'Hi Melody', 'Comic Sans MS', cursive", label: "손글씨 · 하이멜로디" },
  { id: "'Black Han Sans', Impact, sans-serif", label: "효과음 · 검은고딕" },
  { id: "'Do Hyeon', Impact, sans-serif", label: "효과음 · 도현" },
  { id: "'Jua', Impact, sans-serif", label: "효과음 · 주아" },
  { id: "'Single Day', 'Comic Sans MS', cursive", label: "효과음 · 싱글데이" },
  { id: "'Yeon Sung', 'Comic Sans MS', cursive", label: "효과음 · 연성" },
  { id: "'East Sea Dokdo', Impact, cursive", label: "효과음 · 동해독도" },
  { id: "'Dokdo', Impact, cursive", label: "효과음 · 독도" },
  { id: "'Kirang Haerang', Impact, cursive", label: "효과음 · 기랑해랑" },
  { id: "'Cute Font', 'Comic Sans MS', cursive", label: "효과음 · 큐트폰트" },
  { id: "'Gugi', Impact, sans-serif", label: "효과음 · 구기" },
  { id: "'Bagel Fat One', Impact, sans-serif", label: "효과음 · 베이글팻원" },
  { id: "'Stylish', Impact, sans-serif", label: "효과음 · 스타일리시" },
  { id: "'Grandiflora One', Impact, sans-serif", label: "효과음 · 그랜디플로라" },
  { id: "'Orbit', Impact, sans-serif", label: "효과음 · 오르빗" },
  { id: "monospace", label: "기타 · 고정폭" },
] as const;

export function createBubble(type: BubbleType, x: number, y: number): SpeechBubble {
  const hasTail = type === "classic" || type === "thought";
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
    strokeWidth: type === "needle" ? 2 : isText ? 0 : isShape ? 3 : 2.5,
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
    strokeStyle: "solid",
    cornerRadius: 24,
    gradientStop: 50,
    gradientAngle: 0,
    roughness: 0,
    wobble: 0,
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
    case "thought": drawThought(ctx, b); break;
    case "spiky":   drawSpiky(ctx, b); break;
    case "angry":   drawAngry(ctx, b); break;
    case "needle":  drawNeedle(ctx, b); break;
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
  drawSimpleTail(ctx, bubble);
  const left = bubble.x - bubble.width / 2;
  const top = bubble.y - bubble.height / 2;
  const radius = Math.max(0, Math.min(bubble.cornerRadius ?? 24, bubble.width / 2, bubble.height / 2));
  ctx.beginPath();
  ctx.roundRect(left, top, bubble.width, bubble.height, radius);
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawRectangle(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  ctx.beginPath();
  ctx.rect(
    bubble.x - bubble.width / 2,
    bubble.y - bubble.height / 2,
    bubble.width,
    bubble.height
  );
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawEllipse(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  ctx.beginPath();
  ctx.ellipse(
    bubble.x,
    bubble.y,
    bubble.width / 2,
    bubble.height / 2,
    0,
    0,
    Math.PI * 2
  );
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
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

function drawCloud(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  drawSimpleTail(ctx, bubble);
  const roughness = Math.max(0, Math.min(1, bubble.roughness ?? 0));
  const wobble = Math.max(0, Math.min(1, bubble.wobble ?? 0));
  const lobes = Math.max(8, Math.round(14 + roughness * 10));
  const points = Array.from({ length: lobes }, (_, index) => {
    const angle = (index / lobes) * Math.PI * 2 - Math.PI / 2;
    const wave = 1
      + Math.sin(index * 7.31 + 0.7) * roughness * 0.08
      + Math.sin(angle * 3 + 1.17) * wobble * 0.11;
    return {
      x: bubble.x + Math.cos(angle) * bubble.width * 0.5 * wave,
      y: bubble.y + Math.sin(angle) * bubble.height * 0.5 * wave,
    };
  });
  ctx.beginPath();
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    if (index === 0) ctx.moveTo(midpoint.x, midpoint.y);
    ctx.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
  }
  ctx.closePath();
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
}

function drawSimpleTail(ctx: CanvasRenderingContext2D, bubble: SpeechBubble) {
  if (!bubble.tailEnabled) return;
  const angle = Math.atan2(bubble.tailTipY - bubble.y, bubble.tailTipX - bubble.x);
  const baseX = bubble.x + Math.cos(angle) * bubble.width * 0.38;
  const baseY = bubble.y + Math.sin(angle) * bubble.height * 0.38;
  const perpendicularX = -Math.sin(angle) * bubble.tailWidth * 0.5;
  const perpendicularY = Math.cos(angle) * bubble.tailWidth * 0.5;
  ctx.beginPath();
  ctx.moveTo(baseX + perpendicularX, baseY + perpendicularY);
  ctx.lineTo(bubble.tailTipX, bubble.tailTipY);
  ctx.lineTo(baseX - perpendicularX, baseY - perpendicularY);
  ctx.closePath();
  doFill(ctx, bubble);
  doStroke(ctx, bubble);
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
  const maxWidth = Math.max(20, bubble.width - padding * 2);
  const lineHeight = fontSize * (bubble.lineHeightScale ?? 1.28);
  const family = bubble.fontFamily || "sans-serif";
  const weight = bubble.fontWeight === "bold" ? 700 : bubble.fontWeight === "normal" || bubble.fontWeight === undefined ? 400 : bubble.fontWeight;
  const italic = bubble.fontItalic ? "italic " : "";
  ctx.font = `${italic}${weight} ${fontSize}px ${family}`;
  if (bubble.textRuns?.length) {
    drawRichBubbleText(ctx, bubble, { fontSize, padding, maxWidth, lineHeight, family, weight });
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
  const visibleLines = lines.slice(0, Math.max(1, Math.floor((bubble.height - padding) / lineHeight)));
  const startY = bubble.y - ((visibleLines.length - 1) * lineHeight) / 2 + (bubble.baselineOffset ?? 0);
  const textX = bubble.textAlign === "left"
    ? bubble.x - bubble.width / 2 + padding
    : bubble.textAlign === "right"
      ? bubble.x + bubble.width / 2 - padding
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
  metrics: { fontSize: number; padding: number; maxWidth: number; lineHeight: number; family: string; weight: number }
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

  const maxLines = Math.max(1, Math.floor((bubble.height - metrics.padding) / metrics.lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const startY = bubble.y - ((visibleLines.length - 1) * metrics.lineHeight) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  visibleLines.forEach((line, lineIndex) => {
    const width = lineWidths[lineIndex];
    let x = bubble.textAlign === "left"
      ? bubble.x - bubble.width / 2 + metrics.padding
      : bubble.textAlign === "right"
        ? bubble.x + bubble.width / 2 - metrics.padding - width
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

export function getHandlePositions(b: SpeechBubble) {
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
  const rx = b.width / 2;
  const ry = b.height / 2;

  if (b.tailEnabled) {
    const angle = Math.atan2(b.tailTipY - b.y, b.tailTipX - b.x);
    const spread = Math.atan2(b.tailWidth, Math.hypot(b.tailTipX - b.x, b.tailTipY - b.y)) * 1.2;
    const a1 = angle - spread;
    const a2 = angle + spread;

    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx, ry, 0, a2, a1 + Math.PI * 2);
    ctx.lineTo(b.tailTipX, b.tailTipY);
    ctx.closePath();
    doFill(ctx, b);
    doStroke(ctx, b);
  } else {
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
    doFill(ctx, b);
    doStroke(ctx, b);
  }
}

// ═══════════════ 2. thought (타원 + 원 3개 꼬리, 바운딩 박스 바깥) ═══════════════

function drawThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 본체: 타원
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
  doFill(ctx, b);
  doStroke(ctx, b);

  // 꼬리: 작은 원 3개 (바운딩 박스 바깥에서 시작)
  if (b.tailEnabled) {
    const dx = b.tailTipX - b.x;
    const dy = b.tailTipY - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      const nx = dx / dist;
      const ny = dy / dist;

      // 바운딩 박스 경계에서 시작 (타원이 아닌 사각형 경계)
      const halfW = b.width / 2;
      const halfH = b.height / 2;
      // 방향 벡터가 사각형 경계와 만나는 점 계산
      const tx = nx !== 0 ? Math.abs(halfW / nx) : Infinity;
      const ty = ny !== 0 ? Math.abs(halfH / ny) : Infinity;
      const tEdge = Math.min(tx, ty);
      const gap = Math.max(12, Math.min(rx, ry) * 0.15); // 크기 비례 간격
      const startDist = tEdge + gap; // 바운딩 박스 바깥 + 간격

      const baseSize = Math.min(rx, ry);
      // 원 크기: 메인 타원의 10% / 7% / 5% (최소 6/4/3px)
      const sizes = [
        Math.max(6, baseSize * 0.10),
        Math.max(4, baseSize * 0.07),
        Math.max(3, baseSize * 0.05),
      ];

      let currentDist = startDist;
      for (let i = 0; i < 3; i++) {
        const cx = b.x + nx * currentDist;
        const cy = b.y + ny * currentDist;
        ctx.beginPath();
        ctx.arc(cx, cy, sizes[i], 0, Math.PI * 2);
        doFill(ctx, b);
        doStroke(ctx, b);
        currentDist += sizes[i] * 2 + Math.max(3, sizes[i]);
      }
    }
  }
}

// ═══════════════ 3. spiky (비대칭 뾰족 외침) ═══════════════

function drawSpiky(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const spikes = 14;
  const rx = b.width / 2;
  const ry = b.height / 2;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const seed = Math.sin(i * 73.1 + 17.3) * 0.5 + 0.5;
    const outerR = 0.95 + seed * 0.15;
    const innerR = 0.55 + seed * 0.15;
    const ratio = isOuter ? outerR : innerR;
    const px = b.x + Math.cos(angle) * rx * ratio;
    const py = b.y + Math.sin(angle) * ry * ratio;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  doFill(ctx, b);
  doStroke(ctx, b);
}

// ═══════════════ 4. angry (화남 — 모든 선이 안쪽 오목 곡선, 꼭지점 뾰족) ═══════════════

function drawAngry(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const spikes = 12;
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 뾰족 점과 골짜기 점을 교대로 배치
  const points: { x: number; y: number; isTip: boolean }[] = [];
  for (let i = 0; i < spikes; i++) {
    const seed = Math.sin(i * 91.7 + 43.1) * 0.5 + 0.5;
    // 뾰족 끝 (바깥)
    const tipAngle = ((i + 0.5) / spikes) * Math.PI * 2 - Math.PI / 2;
    const tipR = 1.0 + seed * 0.15;
    points.push({
      x: b.x + Math.cos(tipAngle) * rx * tipR,
      y: b.y + Math.sin(tipAngle) * ry * tipR,
      isTip: true,
    });
    // 골짜기 (안쪽)
    const valleyAngle = ((i + 1) / spikes) * Math.PI * 2 - Math.PI / 2;
    const valleyR = 0.65 + seed * 0.1;
    points.push({
      x: b.x + Math.cos(valleyAngle) * rx * valleyR,
      y: b.y + Math.sin(valleyAngle) * ry * valleyR,
      isTip: false,
    });
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    // control point: 중심 쪽으로 당김 → 안쪽 오목 곡선
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    const pullStrength = 0.35;
    const cpX = midX + (b.x - midX) * pullStrength;
    const cpY = midY + (b.y - midY) * pullStrength;

    ctx.quadraticCurveTo(cpX, cpY, next.x, next.y);
  }

  ctx.closePath();
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
