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
    case "ellipse": drawEllipseShape(ctx, b); break;
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

// ═══════════════ 개별 드로잉 ═══════════════

function doFill(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  if (b.fillColor !== "transparent") { ctx.fillStyle = b.fillColor; ctx.fill(); }
}
function doStroke(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.strokeStyle = b.strokeColor; ctx.lineWidth = b.strokeWidth; ctx.stroke();
}

/**
 * 1. classic — 타원 본체 + 꼬리 (연결부분 선 없음)
 * 꼬리와 타원이 하나의 path로 합쳐져서 연결부 stroke 없음
 */
function drawClassic(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  if (b.tailEnabled) {
    // 꼬리 방향 각도
    const angle = Math.atan2(b.tailTipY - b.y, b.tailTipX - b.x);
    const perpX = -Math.sin(angle) * b.tailWidth / 2;
    const perpY = Math.cos(angle) * b.tailWidth / 2;

    // 타원 위의 꼬리 시작점 2개 (각도 ± offset)
    const spread = Math.atan2(b.tailWidth, Math.hypot(b.tailTipX - b.x, b.tailTipY - b.y)) * 1.2;
    const a1 = angle - spread;
    const a2 = angle + spread;
    const p1x = b.x + Math.cos(a1) * rx;
    const p1y = b.y + Math.sin(a1) * ry;
    const p2x = b.x + Math.cos(a2) * rx;
    const p2y = b.y + Math.sin(a2) * ry;

    // 하나의 path: 타원(꼬리 갈라진 부분 제외) + 꼬리
    ctx.beginPath();
    // 타원을 a2 → (한 바퀴 돌아서) → a1 까지 그림
    ctx.ellipse(b.x, b.y, rx, ry, 0, a2, a1 + Math.PI * 2);
    // 꼬리 삼각형
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

/**
 * 2. thought — 큰 타원 + 작은 원 3개 꼬리 (겹치지 않음)
 */
function drawThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 본체: 타원
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
  doFill(ctx, b);
  doStroke(ctx, b);

  // 꼬리: 작은 원 3개 (겹치지 않게 간격 조절)
  if (b.tailEnabled) {
    const dx = b.tailTipX - b.x;
    const dy = b.tailTipY - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      const nx = dx / dist;
      const ny = dy / dist;
      // 타원 경계에서 시작
      const edgeDist = Math.sqrt((rx * ny) ** 2 + (ry * nx) ** 2);
      const startDist = Math.min(edgeDist * 0.95, dist * 0.5);

      const sizes = [10, 7, 4];
      let currentDist = startDist + 8;

      for (let i = 0; i < 3; i++) {
        const cx = b.x + nx * currentDist;
        const cy = b.y + ny * currentDist;
        ctx.beginPath();
        ctx.arc(cx, cy, sizes[i], 0, Math.PI * 2);
        doFill(ctx, b);
        doStroke(ctx, b);
        currentDist += sizes[i] * 2 + 4; // 원 지름 + 간격
      }
    }
  }
}

/**
 * 3. spiky — 비대칭 뾰족 외침 말풍선
 */
function drawSpiky(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const spikes = 14;
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 비대칭을 위한 시드 기반 편차
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const isOuter = i % 2 === 0;
    // 비대칭: 각 spike마다 약간 다른 비율
    const seed = Math.sin(i * 73.1 + 17.3) * 0.5 + 0.5;
    const outerR = 0.95 + seed * 0.15; // 0.95~1.10
    const innerR = 0.55 + seed * 0.15;  // 0.55~0.70
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

/**
 * 4. ellipse — 단순 타원
 */
function drawEllipseShape(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
  doFill(ctx, b);
  doStroke(ctx, b);
}

/**
 * 5. needle (집중선)
 * 바깥에서 안쪽으로 뾰족하게 가늘어지는 직선들
 * 끝이 뾰족 (lineWidth가 바깥→안쪽으로 줄어듦 = 삼각형으로 그림)
 */
function drawNeedle(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 200;
  const innerRatio = 0.42;

  ctx.fillStyle = b.strokeColor; // 삼각형으로 그리므로 fill 사용

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    // 시드 기반 랜덤 편차
    const seed = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
    const seed2 = Math.sin(i * 269.5 + 183.3) * 0.5 + 0.5;

    const outerJitter = 0.97 + seed * 0.06;
    const innerJitter = innerRatio + (seed2 - 0.5) * 0.12;

    // 바깥점
    const outerX = b.x + Math.cos(angle) * rx * outerJitter;
    const outerY = b.y + Math.sin(angle) * ry * outerJitter;

    // 안쪽 끝점 (뾰족한 끝)
    const innerX = b.x + Math.cos(angle) * rx * innerJitter;
    const innerY = b.y + Math.sin(angle) * ry * innerJitter;

    // 바깥 폭 (삼각형 밑변)
    const baseWidth = (1.5 + seed * 2.0) * (b.strokeWidth * 0.5);
    const perpX = -Math.sin(angle) * baseWidth;
    const perpY = Math.cos(angle) * baseWidth;

    // 뾰족한 삼각형: 바깥 넓고 → 안쪽 점 (폭 0)
    ctx.beginPath();
    ctx.moveTo(outerX + perpX, outerY + perpY);
    ctx.lineTo(outerX - perpX, outerY - perpY);
    ctx.lineTo(innerX, innerY); // 뾰족한 끝
    ctx.closePath();
    ctx.fill();
  }
}
