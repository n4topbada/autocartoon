/**
 * 말풍선 Canvas 2D 드로잉 함수 (5종)
 */

export type BubbleType = "classic" | "thought" | "spiky" | "angry" | "needle";

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

export function createBubble(type: BubbleType, x: number, y: number): SpeechBubble {
  const hasTail = type === "classic" || type === "thought";
  return {
    id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type, x, y,
    width: 200, height: 140,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: type === "needle" ? 1 : 2.5,
    opacity: 1,
    tailEnabled: hasTail,
    tailTipX: x,
    tailTipY: y + 120,
    tailWidth: 24,
  };
}

export function drawBubble(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.save();
  ctx.globalAlpha *= b.opacity;
  switch (b.type) {
    case "classic": drawClassic(ctx, b); break;
    case "thought": drawThought(ctx, b); break;
    case "spiky":   drawSpiky(ctx, b); break;
    case "angry":   drawAngry(ctx, b); break;
    case "needle":  drawNeedle(ctx, b); break;
  }
  ctx.restore();
}

export function drawBubbleSelection(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const left = b.x - b.width / 2;
  const top = b.y - b.height / 2;
  ctx.save();
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(left, top, b.width, b.height);
  ctx.setLineDash([]);
  for (const h of getHandlePositions(b)) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    ctx.fillRect(h.x - 5, h.y - 5, 10, 10);
    ctx.strokeRect(h.x - 5, h.y - 5, 10, 10);
  }
  if (b.tailEnabled) {
    ctx.beginPath();
    ctx.arc(b.tailTipX, b.tailTipY, 7, 0, Math.PI * 2);
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
  return [
    { id: "nw", x: l, y: t }, { id: "n", x: b.x, y: t },
    { id: "ne", x: r, y: t }, { id: "e", x: r, y: b.y },
    { id: "se", x: r, y: bt }, { id: "s", x: b.x, y: bt },
    { id: "sw", x: l, y: bt }, { id: "w", x: l, y: b.y },
  ];
}

export function hitTestBubble(mx: number, my: number, b: SpeechBubble): "body" | "tail" | string | null {
  if (b.tailEnabled && Math.hypot(mx - b.tailTipX, my - b.tailTipY) < 14) return "tail";
  for (const h of getHandlePositions(b)) {
    if (Math.abs(mx - h.x) < 10 && Math.abs(my - h.y) < 10) return h.id;
  }
  const l = b.x - b.width / 2, t = b.y - b.height / 2;
  if (mx >= l && mx <= l + b.width && my >= t && my <= t + b.height) return "body";
  return null;
}

// ═══════════════ 유틸 ═══════════════

function doFill(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  if (b.fillColor !== "transparent") { ctx.fillStyle = b.fillColor; ctx.fill(); }
}
function doStroke(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.strokeStyle = b.strokeColor; ctx.lineWidth = b.strokeWidth; ctx.stroke();
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
      const startDist = tEdge + 8; // 바운딩 박스 8px 바깥

      const sizes = [
        Math.max(8, Math.min(rx, ry) * 0.12),
        Math.max(5, Math.min(rx, ry) * 0.08),
        Math.max(3, Math.min(rx, ry) * 0.05),
      ];

      let currentDist = startDist;
      for (let i = 0; i < 3; i++) {
        const cx = b.x + nx * currentDist;
        const cy = b.y + ny * currentDist;
        ctx.beginPath();
        ctx.arc(cx, cy, sizes[i], 0, Math.PI * 2);
        doFill(ctx, b);
        doStroke(ctx, b);
        currentDist += sizes[i] * 2 + Math.max(4, sizes[i] * 0.8);
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

// ═══════════════ 4. angry (화남 — 곡선 뾰족, 안쪽으로 오목) ═══════════════

function drawAngry(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const spikes = 12;
  const rx = b.width / 2;
  const ry = b.height / 2;

  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const a1 = (i / spikes) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / spikes) * Math.PI * 2 - Math.PI / 2;
    const aMid = (a1 + a2) / 2;

    const seed = Math.sin(i * 91.7 + 43.1) * 0.5 + 0.5;

    // 바깥 뾰족 점 (spike tip)
    const outerR = 1.0 + seed * 0.12;
    const tipX = b.x + Math.cos(aMid) * rx * outerR;
    const tipY = b.y + Math.sin(aMid) * ry * outerR;

    // 안쪽 오목 점 (spike valley) — 안쪽으로 곡선
    const innerR = 0.65 + seed * 0.1;
    const valleyX = b.x + Math.cos(a2) * rx * innerR;
    const valleyY = b.y + Math.sin(a2) * ry * innerR;

    // 시작점
    const startR = 0.65 + Math.sin((i - 1) * 91.7 + 43.1) * 0.05 + 0.05;
    const startX = b.x + Math.cos(a1) * rx * startR;
    const startY = b.y + Math.sin(a1) * ry * startR;

    if (i === 0) ctx.moveTo(startX, startY);

    // 곡선: 시작 → tip (quadratic curve, 안쪽으로 오목)
    ctx.quadraticCurveTo(tipX, tipY, valleyX, valleyY);
  }
  ctx.closePath();
  doFill(ctx, b);
  doStroke(ctx, b);
}

// ═══════════════ 5. needle (집중선 — 가상 타원 테두리 기준 안팎으로 뾰족) ═══════════════

function drawNeedle(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 300;

  ctx.fillStyle = b.strokeColor;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;

    // 시드 기반 랜덤
    const seed1 = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
    const seed2 = Math.sin(i * 269.5 + 183.3) * 0.5 + 0.5;
    const seed3 = Math.sin(i * 419.2 + 67.1) * 0.5 + 0.5;

    // 가상 타원 테두리 위의 중심점
    const centerX = b.x + Math.cos(angle) * rx;
    const centerY = b.y + Math.sin(angle) * ry;

    // 바깥쪽 끝 (뾰족, 타원 바깥)
    const outerLen = 15 + seed1 * 25; // 15~40px 바깥으로
    const outerX = centerX + Math.cos(angle) * outerLen;
    const outerY = centerY + Math.sin(angle) * outerLen;

    // 안쪽 끝 (뾰족, 타원 안쪽)
    const innerLen = 15 + seed2 * 25; // 15~40px 안쪽으로
    const innerX = centerX - Math.cos(angle) * innerLen;
    const innerY = centerY - Math.sin(angle) * innerLen;

    // 중심부 폭 (가상 타원 테두리 위치에서 가장 넓음)
    const midWidth = (0.8 + seed3 * 1.5) * b.strokeWidth;
    const perpX = -Math.sin(angle) * midWidth;
    const perpY = Math.cos(angle) * midWidth;

    // 다이아몬드/방추형: 바깥 뾰족 → 중앙 넓음 → 안쪽 뾰족
    ctx.beginPath();
    ctx.moveTo(outerX, outerY); // 바깥 뾰족 끝
    ctx.lineTo(centerX + perpX, centerY + perpY); // 중앙 좌
    ctx.lineTo(innerX, innerY); // 안쪽 뾰족 끝
    ctx.lineTo(centerX - perpX, centerY - perpY); // 중앙 우
    ctx.closePath();
    ctx.fill();
  }
}
