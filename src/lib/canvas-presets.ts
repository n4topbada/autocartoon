export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CaptionSlot = "top" | "bottom";

export interface WatermarkSettings {
  text: string;
  fontFamily: string;
  fontWeight: number | "normal" | "bold";
  textColor: string;
  fontSize: number;
  margin: number;
  outlineWidth: number;
  position: WatermarkPosition;
}

export interface CaptionSettings {
  fontFamily: string;
  fontWeight: number | "normal" | "bold";
  textColor: string;
  fontSize: number;
  margin: number;
}

interface CanvasPresetBubble extends SpeechBubble, Record<string, unknown> {
  presetKind?: "watermark" | "caption" | "sfx";
  captionSlot?: CaptionSlot;
}

interface CanvasPresetLayer extends Record<string, unknown> {
  id: string;
  name: string;
  pixelUrl: string | null;
  fillColor: string | null;
  background: Record<string, unknown> | null;
  bubbles: CanvasPresetBubble[];
}

export interface CanvasPresetDocument extends Record<string, unknown> {
  version: 1 | 2 | 3;
  aspect: string;
  width: number;
  height: number;
  pageBackground?: Record<string, unknown>;
  layers: CanvasPresetLayer[];
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  text: "@wonybananabot",
  fontFamily: "'Pretendard', 'Malgun Gothic', sans-serif",
  fontWeight: "bold",
  textColor: "#ffffff",
  fontSize: 20,
  margin: 28,
  outlineWidth: 2,
  position: "bottom-right",
};

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  fontFamily: "'Jua', 'Malgun Gothic', sans-serif",
  fontWeight: "normal",
  textColor: "#1a1a1a",
  fontSize: 48,
  margin: 48,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function normalizeHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

export function normalizeWatermarkSettings(value: Partial<WatermarkSettings>): WatermarkSettings {
  const weight = value.fontWeight;
  return {
    text: typeof value.text === "string" ? value.text.trim().slice(0, 120) : DEFAULT_WATERMARK_SETTINGS.text,
    fontFamily: typeof value.fontFamily === "string" && value.fontFamily.trim()
      ? value.fontFamily.trim().slice(0, 180)
      : DEFAULT_WATERMARK_SETTINGS.fontFamily,
    fontWeight: weight === "normal" || weight === "bold" || (typeof weight === "number" && weight >= 100 && weight <= 900)
      ? weight
      : DEFAULT_WATERMARK_SETTINGS.fontWeight,
    textColor: normalizeHex(value.textColor ?? "", DEFAULT_WATERMARK_SETTINGS.textColor),
    fontSize: Math.round(clamp(value.fontSize ?? DEFAULT_WATERMARK_SETTINGS.fontSize, 10, 160)),
    margin: Math.round(clamp(value.margin ?? DEFAULT_WATERMARK_SETTINGS.margin, 0, 320)),
    outlineWidth: Math.round(clamp(value.outlineWidth ?? DEFAULT_WATERMARK_SETTINGS.outlineWidth, 0, 16)),
    position: ["top-left", "top-right", "bottom-left", "bottom-right"].includes(value.position ?? "")
      ? value.position!
      : DEFAULT_WATERMARK_SETTINGS.position,
  };
}

export function normalizeCaptionSettings(value: Partial<CaptionSettings>): CaptionSettings {
  const weight = value.fontWeight;
  return {
    fontFamily: typeof value.fontFamily === "string" && value.fontFamily.trim()
      ? value.fontFamily.trim().slice(0, 180)
      : DEFAULT_CAPTION_SETTINGS.fontFamily,
    fontWeight: weight === "normal" || weight === "bold" || (typeof weight === "number" && weight >= 100 && weight <= 900)
      ? weight
      : DEFAULT_CAPTION_SETTINGS.fontWeight,
    textColor: normalizeHex(value.textColor ?? "", DEFAULT_CAPTION_SETTINGS.textColor),
    fontSize: Math.round(clamp(value.fontSize ?? DEFAULT_CAPTION_SETTINGS.fontSize, 12, 180)),
    margin: Math.round(clamp(value.margin ?? DEFAULT_CAPTION_SETTINGS.margin, 0, 360)),
  };
}

function presetId(kind: string) {
  return `preset_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createWatermarkBubble(
  width: number,
  height: number,
  rawSettings: Partial<WatermarkSettings>,
  id = presetId("watermark")
): CanvasPresetBubble {
  const settings = normalizeWatermarkSettings(rawSettings);
  const boxWidth = Math.min(
    Math.max(120, width - settings.margin * 2),
    Math.max(180, settings.text.length * settings.fontSize * 0.72 + settings.outlineWidth * 4)
  );
  const boxHeight = Math.max(42, settings.fontSize * 1.8 + settings.outlineWidth * 2);
  const left = settings.position.endsWith("left");
  const top = settings.position.startsWith("top");
  return {
    id,
    type: "text",
    presetKind: "watermark",
    x: left ? settings.margin + boxWidth / 2 : width - settings.margin - boxWidth / 2,
    y: top ? settings.margin + boxHeight / 2 : height - settings.margin - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
    fillColor: "transparent",
    strokeColor: "transparent",
    strokeWidth: 0,
    opacity: 1,
    tailEnabled: false,
    tailTipX: width / 2,
    tailTipY: height / 2,
    tailWidth: 0,
    text: settings.text,
    textColor: settings.textColor,
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
    textAlign: "center",
    fontFamily: settings.fontFamily,
    outlineColor: "#000000",
    outlineWidth: settings.outlineWidth,
    lineHeightScale: 1.16,
    letterSpacing: 0,
    rotation: 0,
    watermarkPosition: settings.position,
    watermarkMargin: settings.margin,
  };
}

export function createCaptionBubble(
  width: number,
  height: number,
  slot: CaptionSlot,
  text: string,
  rawSettings: Partial<CaptionSettings>,
  id = presetId(`caption_${slot}`)
): CanvasPresetBubble {
  const settings = normalizeCaptionSettings(rawSettings);
  const boxHeight = Math.max(56, settings.fontSize * 2.15);
  return {
    id,
    type: "text",
    presetKind: "caption",
    captionSlot: slot,
    x: width / 2,
    y: slot === "top" ? settings.margin + boxHeight / 2 : height - settings.margin - boxHeight / 2,
    width: Math.max(160, width - settings.margin * 2),
    height: boxHeight,
    fillColor: "transparent",
    strokeColor: "transparent",
    strokeWidth: 0,
    opacity: 1,
    tailEnabled: false,
    tailTipX: width / 2,
    tailTipY: height / 2,
    tailWidth: 0,
    text: text.trim().slice(0, 1_000) || (slot === "top" ? "상단 캡션" : "하단 캡션"),
    textColor: settings.textColor,
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
    textAlign: "center",
    fontFamily: settings.fontFamily,
    lineHeightScale: 1.16,
    letterSpacing: 0,
    rotation: 0,
  };
}

function createBaseLayer(id: string, name: string, width: number, height: number): CanvasPresetLayer {
  return {
    id,
    name,
    locked: false,
    groupId: null,
    pixelUrl: null,
    opacity: 1,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width,
    height,
    visible: true,
    fillColor: null,
    bubbles: [],
    filter: "original",
    filterIntensity: 1,
    clipToBelow: false,
    background: null,
  };
}

export function createCanvasPresetDocument(options: {
  width: number;
  height: number;
  aspect: string;
  imageUrl?: string | null;
}): CanvasPresetDocument {
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  const layers: CanvasPresetLayer[] = [];
  if (options.imageUrl) {
    layers.push({
      ...createBaseLayer("layer_initial", "원본 이미지", width, height),
      pixelUrl: options.imageUrl,
    });
  }
  return {
    version: 3,
    aspect: options.aspect,
    width,
    height,
    pageBackground: {
      type: "solid",
      color: "#ffffff",
      color2: "#dbeafe",
      angle: 0,
      stop: 50,
      texture: "paper",
    },
    layers,
  };
}

export function parseCanvasPresetDocument(value: unknown): CanvasPresetDocument | null {
  if (!isRecord(value) || !Array.isArray(value.layers)) return null;
  if ((value.version !== 1 && value.version !== 2 && value.version !== 3) || typeof value.width !== "number" || typeof value.height !== "number") return null;
  const documentWidth = value.width;
  const documentHeight = value.height;
  const layers = value.layers.filter(isRecord).map((layer, index) => ({
    ...layer,
    id: typeof layer.id === "string" ? layer.id : `layer_${index}`,
    name: typeof layer.name === "string" ? layer.name : "레이어",
    pixelUrl: typeof layer.pixelUrl === "string" ? layer.pixelUrl : null,
    fillColor: typeof layer.fillColor === "string" ? layer.fillColor : null,
    background: isRecord(layer.background) ? layer.background : null,
    bubbles: Array.isArray(layer.bubbles)
      ? layer.bubbles.filter(isRecord).map((bubble, bubbleIndex) => ({
          ...bubble,
          id: typeof bubble.id === "string" ? bubble.id : `bubble_${index}_${bubbleIndex}`,
          type: (typeof bubble.type === "string" ? bubble.type : "text") as BubbleType,
          x: typeof bubble.x === "number" ? bubble.x : documentWidth / 2,
          y: typeof bubble.y === "number" ? bubble.y : documentHeight / 2,
          width: typeof bubble.width === "number" ? bubble.width : 200,
          height: typeof bubble.height === "number" ? bubble.height : 80,
          fillColor: typeof bubble.fillColor === "string" ? bubble.fillColor : "transparent",
          strokeColor: typeof bubble.strokeColor === "string" ? bubble.strokeColor : "transparent",
          strokeWidth: typeof bubble.strokeWidth === "number" ? bubble.strokeWidth : 0,
          opacity: typeof bubble.opacity === "number" ? bubble.opacity : 1,
          tailEnabled: bubble.tailEnabled === true,
          tailTipX: typeof bubble.tailTipX === "number" ? bubble.tailTipX : documentWidth / 2,
          tailTipY: typeof bubble.tailTipY === "number" ? bubble.tailTipY : documentHeight / 2,
          tailWidth: typeof bubble.tailWidth === "number" ? bubble.tailWidth : 0,
        } satisfies CanvasPresetBubble))
      : [],
  } satisfies CanvasPresetLayer));
  return {
    ...value,
    version: value.version,
    aspect: typeof value.aspect === "string" ? value.aspect : "1:1",
    width: value.width,
    height: value.height,
    layers,
  };
}

function cloneDocument(value: CanvasPresetDocument) {
  return JSON.parse(JSON.stringify(value)) as CanvasPresetDocument;
}

export function applyWatermarkToCanvas(
  value: CanvasPresetDocument,
  settings: Partial<WatermarkSettings>
): CanvasPresetDocument {
  const document = cloneDocument(value);
  let found = false;
  document.layers = document.layers.map((layer) => {
    const watermarkLayer = layer.name === "워터마크";
    return {
      ...layer,
      bubbles: layer.bubbles.map((bubble) => {
        if (found || (bubble.presetKind !== "watermark" && !watermarkLayer)) return bubble;
        found = true;
        return { ...bubble, ...createWatermarkBubble(document.width, document.height, settings, bubble.id) };
      }),
    };
  });
  if (!found) {
    document.layers.push({
      ...createBaseLayer(presetId("watermark_layer"), "워터마크", document.width, document.height),
      bubbles: [createWatermarkBubble(document.width, document.height, settings)],
    });
  }
  return document;
}

export function deleteWatermarkFromCanvas(value: CanvasPresetDocument): CanvasPresetDocument {
  const document = cloneDocument(value);
  document.layers = document.layers.flatMap((layer) => {
    const bubbles = layer.bubbles.filter((bubble) => bubble.presetKind !== "watermark");
    const wasLegacyWatermark = layer.name === "워터마크";
    if (wasLegacyWatermark && bubbles.length === 0 && !layer.pixelUrl && !layer.fillColor && !layer.background) return [];
    return [{ ...layer, bubbles }];
  });
  return document;
}

export function applyCaptionStyleToCanvas(
  value: CanvasPresetDocument,
  rawSettings: Partial<CaptionSettings>
): { canvas: CanvasPresetDocument; updated: number } {
  const document = cloneDocument(value);
  const settings = normalizeCaptionSettings(rawSettings);
  let updated = 0;
  document.layers = document.layers.map((layer) => {
    const captionLayer = layer.name.includes("캡션") || layer.name.includes("내레이션");
    return {
      ...layer,
      bubbles: layer.bubbles.map((bubble) => {
        if (bubble.presetKind !== "caption" && !captionLayer) return bubble;
        const slot: CaptionSlot = bubble.captionSlot === "top" || bubble.captionSlot === "bottom"
          ? bubble.captionSlot
          : bubble.y < document.height / 2 ? "top" : "bottom";
        updated += 1;
        const geometry = createCaptionBubble(
          document.width,
          document.height,
          slot,
          typeof bubble.text === "string" ? bubble.text : "",
          settings,
          bubble.id
        );
        return { ...bubble, ...geometry };
      }),
    };
  });
  return { canvas: document, updated };
}
import type { BubbleType, SpeechBubble } from "@/lib/bubble-draw";
