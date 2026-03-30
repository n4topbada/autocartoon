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
  fillColor: string;   // "transparent" 지원
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
    width: 200,
    height: 140,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: type === "needle" ? 1 : 2.5,
    opacity: 1,
    tailEnabled: hasTail,
    tailTipX: x,
    tailTipY: y + 120,
    tailWidth: 20,
  };
}

/** 메인 디스패처 */
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

/** 선택 오버레이 */
export function drawBubbleSelection(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const left = b.x - b.width / 2;
  const top = b.y - b.height / 2;

  ctx.save();
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(left, top, b.width, b.height);
  ctx.setLineDash([]);

  const handles = getHandlePositions(b);
  for (const h of handles) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
    ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
  }

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

export function getHandlePositions(b: SpeechBubble) {
  const l = b.x - b.width / 2;
  const r = b.x + b.width / 2;
  const t = b.y - b.height / 2;
  const bt = b.y + b.height / 2;
  return [
    { id: "nw", x: l, y: t }, { id: "n", x: b.x, y: t },
    { id: "ne", x: r, y: t }, { id: "e", x: r, y: b.y },
    { id: "se", x: r, y: bt }, { id: "s", x: b.x, y: bt },
    { id: "sw", x: l, y: bt }, { id: "w", x: l, y: b.y },
  ];
}

export function hitTestBubble(mx: number, my: number, b: SpeechBubble): "body" | "tail" | string | null {
  if (b.tailEnabled) {
    if (Math.hypot(mx - b.tailTipX, my - b.tailTipY) < 12) return "tail";
  }
  for (const h of getHandlePositions(b)) {
    if (Math.abs(mx - h.x) < 8 && Math.abs(my - h.y) < 8) return h.id;
  }
  const l = b.x - b.width / 2;
  const t = b.y - b.height / 2;
  if (mx >= l && mx <= l + b.width && my >= t && my <= t + b.height) return "body";
  return null;
}

// ═══════════════ 개별 드로잉 ═══════════════

function applyFillStroke(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  if (b.fillColor !== "transparent") {
    ctx.fillStyle = b.fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = b.strokeColor;
  ctx.lineWidth = b.strokeWidth;
  ctx.stroke();
}

/**
 * 1. classic — 타원형 본체 + 삼각형 꼬리
 */
function drawClassic(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 꼬리 먼저 (fill만, 본체가 위에 덮음)
  if (b.tailEnabled) {
    const angle = Math.atan2(b.tailTipY - b.y, b.tailTipX - b.x);
    const perpX = -Math.sin(angle) * b.tailWidth / 2;
    const perpY = Math.cos(angle) * b.tailWidth / 2;
    // 타원 경계 위의 꼬리 시작점
    const edgeX = b.x + Math.cos(angle) * rx * 0.85;
    const edgeY = b.y + Math.sin(angle) * ry * 0.85;

    ctx.beginPath();
    ctx.moveTo(edgeX + perpX, edgeY + perpY);
    ctx.lineTo(b.tailTipX, b.tailTipY);
    ctx.lineTo(edgeX - perpX, edgeY - perpY);
    ctx.closePath();
    if (b.fillColor !== "transparent") {
      ctx.fillStyle = b.fillColor;
      ctx.fill();
    }
    ctx.strokeStyle = b.strokeColor;
    ctx.lineWidth = b.strokeWidth;
    ctx.stroke();
  }

  // 본체: 타원
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
  applyFillStroke(ctx, b);
}

/**
 * 2. thought — 큰 타원 본체 + 작은 원 3개 꼬리 (생각 말풍선)
 */
function drawThought(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;

  // 본체: 타원
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
  applyFillStroke(ctx, b);

  // 꼬리: 점점 작아지는 원 3개
  if (b.tailEnabled) {
    const dx = b.tailTipX - b.x;
    const dy = b.tailTipY - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const sizes = [14, 10, 6]; // 원 크기
      const positions = [0.55, 0.72, 0.88]; // 본체→꼬리끝 비율

      for (let i = 0; i < 3; i++) {
        const cx = b.x + dx * positions[i];
        const cy = b.y + dy * positions[i];
        ctx.beginPath();
        ctx.arc(cx, cy, sizes[i], 0, Math.PI * 2);
        if (b.fillColor !== "transparent") {
          ctx.fillStyle = b.fillColor;
          ctx.fill();
        }
        ctx.strokeStyle = b.strokeColor;
        ctx.lineWidth = b.strokeWidth;
        ctx.stroke();
      }
    }
  }
}

/**
 * 3. spiky — 뾰족뾰족 별폭발 타원 (밤송이)
 */
function drawSpiky(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const spikes = 16;
  const rx = b.width / 2;
  const ry = b.height / 2;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const ratio = isOuter ? 1.0 : 0.7;
    const px = b.x + Math.cos(angle) * rx * ratio;
    const py = b.y + Math.sin(angle) * ry * ratio;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  applyFillStroke(ctx, b);
}

/**
 * 4. ellipse — 단순 타원
 */
function drawEllipseShape(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
  applyFillStroke(ctx, b);
}

/**
 * 5. needle (바늘 말풍선)
 * 타원 바깥에서 중심을 향해 직선을 촘촘하게 그어서
 * 중앙에 빈 타원 공간이 자연스럽게 생기는 집중선 효과
 */
function drawNeedle(ctx: CanvasRenderingContext2D, b: SpeechBubble) {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const n = 300; // 직선 수
  const innerRatio = 0.45; // 내부 빈 공간 비율 (0.45 = 타원의 45% 지점에서 끝남)

  ctx.strokeStyle = b.strokeColor;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    // 약간의 랜덤 편차 (시드 기반으로 결정적)
    const seed = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
    const outerJitter = 0.95 + seed * 0.1; // 0.95~1.05
    const innerJitter = innerRatio + (seed - 0.5) * 0.15; // 내부 끝점 편차

    // 바깥점 (타원 경계 + 약간 바깥)
    const outerX = b.x + Math.cos(angle) * rx * outerJitter;
    const outerY = b.y + Math.sin(angle) * ry * outerJitter;

    // 안쪽 끝점 (중심 방향, innerRatio 지점에서 끝남)
    const innerX = b.x + Math.cos(angle) * rx * innerJitter;
    const innerY = b.y + Math.sin(angle) * ry * innerJitter;

    // 선 두께: 바깥에서 얇게 시작 → 안쪽에서 더 얇게
    ctx.lineWidth = Math.max(b.strokeWidth * (0.5 + seed * 0.8), 0.3);

    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.lineTo(innerX, innerY);
    ctx.stroke();
  }
}
