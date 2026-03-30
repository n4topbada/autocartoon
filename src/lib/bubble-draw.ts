/**
 * 말풍선 Canvas 2D 드로잉 함수 (5종)
 */

export type BubbleType = "classic" | "thought" | "spiky" | "ellipse" | "needle";

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
}

export function createBubble(
  type: BubbleType,
  x: number,
  y: number
): SpeechBubble {
  const hasTail = type === "classic" || type === "thought";
  return {
    id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    x,
    y,
    width: type === "needle" ? 180 : 200,
    height: type === "needle" ? 140 : 120,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: type === "needle" ? 1 : 3,
    opacity: 1,
    tailEnabled: hasTail,
    tailTipX: x,
    tailTipY: y + 100,
    tailWidth: 20,
  };
}

/** 메인 디스패처 */
export function drawBubble(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.save();
  ctx.globalAlpha *= b.opacity;

  switch (b.type) {
    case "classic":
      drawClassic(ctx, b);
      break;
    case "thought":
      drawThought(ctx, b);
      break;
    case "spiky":
      drawSpiky(ctx, b);
      break;
    case "ellipse":
      drawEllipse(ctx, b);
      break;
    case "needle":
      drawNeedle(ctx, b);
      break;
  }

  ctx.restore();
}

/** 선택 오버레이 (바운딩 박스 + 핸들) */
export function drawBubbleSelection(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const left = b.x - b.width / 2;
  const top = b.y - b.height / 2;

  ctx.save();
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(left, top, b.width, b.height);
  ctx.setLineDash([]);

  // 8개 리사이즈 핸들
  const handles = getHandlePositions(b);
  for (const h of handles) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
    ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
  }

  // 꼬리 핸들
  if (b.tailEnabled) {
    ctx.beginPath();
    ctx.arc(b.tailTipX, b.tailTipY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

/** 핸들 위치 (8개) */
export function getHandlePositions(b: SpeechBubble) {
  const l = b.x - b.width / 2;
  const r = b.x + b.width / 2;
  const t = b.y - b.height / 2;
  const bt = b.y + b.height / 2;
  return [
    { id: "nw", x: l, y: t },
    { id: "n", x: b.x, y: t },
    { id: "ne", x: r, y: t },
    { id: "e", x: r, y: b.y },
    { id: "se", x: r, y: bt },
    { id: "s", x: b.x, y: bt },
    { id: "sw", x: l, y: bt },
    { id: "w", x: l, y: b.y },
  ];
}

/** 히트 테스트 */
export function hitTestBubble(
  mx: number,
  my: number,
  b: SpeechBubble
): "body" | "tail" | string | null {
  // 꼬리 핸들
  if (b.tailEnabled) {
    const dt = Math.hypot(mx - b.tailTipX, my - b.tailTipY);
    if (dt < 12) return "tail";
  }

  // 리사이즈 핸들
  for (const h of getHandlePositions(b)) {
    if (Math.abs(mx - h.x) < 8 && Math.abs(my - h.y) < 8) return h.id;
  }

  // 본체 (바운딩 박스)
  const l = b.x - b.width / 2;
  const t = b.y - b.height / 2;
  if (mx >= l && mx <= l + b.width && my >= t && my <= t + b.height) return "body";

  return null;
}

// ─────────── 개별 드로잉 ───────────

function drawClassic(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const l = b.x - b.width / 2;
  const t = b.y - b.height / 2;
  const r = Math.min(b.width, b.height) * 0.2;

  // 꼬리 (fill만, 본체 아래에 깔림)
  if (b.tailEnabled) {
    const angle = Math.atan2(b.tailTipY - b.y, b.tailTipX - b.x);
    const perpX = -Math.sin(angle) * b.tailWidth / 2;
    const perpY = Math.cos(angle) * b.tailWidth / 2;
    // 본체 경계 교차점
    const edgeDist = Math.min(b.width, b.height) * 0.4;
    const baseX = b.x + Math.cos(angle) * edgeDist;
    const baseY = b.y + Math.sin(angle) * edgeDist;

    ctx.beginPath();
    ctx.moveTo(baseX + perpX, baseY + perpY);
    ctx.lineTo(b.tailTipX, b.tailTipY);
    ctx.lineTo(baseX - perpX, baseY - perpY);
    ctx.closePath();
    ctx.fillStyle = b.fillColor;
    ctx.fill();
    ctx.strokeStyle = b.strokeColor;
    ctx.lineWidth = b.strokeWidth;
    ctx.stroke();
  }

  // 본체 (둥근 사각형)
  ctx.beginPath();
  ctx.moveTo(l + r, t);
  ctx.arcTo(l + b.width, t, l + b.width, t + b.height, r);
  ctx.arcTo(l + b.width, t + b.height, l, t + b.height, r);
  ctx.arcTo(l, t + b.height, l, t, r);
  ctx.arcTo(l, t, l + b.width, t, r);
  ctx.closePath();
  ctx.fillStyle = b.fillColor;
  ctx.fill();
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  ctx.stroke();
}

function drawThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 8;
  const bumpR = Math.min(rx, ry) * 0.35;

  // 본체: 구름 (원 여러 개)
  ctx.fillStyle = b.fillColor;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const cx = b.x + Math.cos(angle) * (rx - bumpR * 0.5);
    const cy = b.y + Math.sin(angle) * (ry - bumpR * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, bumpR, 0, Math.PI * 2);
    ctx.fill();
  }
  // 중앙 채우기
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, rx - bumpR * 0.3, ry - bumpR * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 외곽선
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const cx = b.x + Math.cos(angle) * (rx - bumpR * 0.5);
    const cy = b.y + Math.sin(angle) * (ry - bumpR * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, bumpR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 꼬리: 작은 원 3개
  if (b.tailEnabled) {
    const dx = b.tailTipX - b.x;
    const dy = b.tailTipY - b.y;
    for (let i = 0; i < 3; i++) {
      const t = 0.4 + i * 0.2;
      const cx = b.x + dx * t;
      const cy = b.y + dy * t;
      const cr = bumpR * (0.5 - i * 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(cr, 4), 0, Math.PI * 2);
      ctx.fillStyle = b.fillColor;
      ctx.fill();
      ctx.strokeStyle = b.strokeColor;
      ctx.lineWidth = b.strokeWidth;
      ctx.stroke();
    }
  }
}

function drawSpiky(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const points = 14;
  const rx = b.width / 2;
  const ry = b.height / 2;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const r = isOuter ? 1.0 : 0.65;
    const px = b.x + Math.cos(angle) * rx * r;
    const py = b.y + Math.sin(angle) * ry * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = b.fillColor;
  ctx.fill();
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  ctx.stroke();
}

function drawEllipse(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = b.fillColor;
  ctx.fill();
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  ctx.stroke();
}

function drawNeedle(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 250; // 직선 수
  const offset = Math.floor(n * 0.35); // 반대편 offset → 빈 공간 크기 결정

  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = Math.max(b.strokeWidth * 0.5, 0.5);

  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + offset) / n) * Math.PI * 2;

    const x1 = b.x + Math.cos(a1) * rx;
    const y1 = b.y + Math.sin(a1) * ry;
    const x2 = b.x + Math.cos(a2) * rx;
    const y2 = b.y + Math.sin(a2) * ry;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}
