"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { uploadViaTicket } from "@/lib/client-upload";
import styles from "./CanvasEditor.module.css";
import {
  LuArrowLeft,
  LuPlus,
  LuTrash2,
  LuMove,
  LuCrop,
  LuEraser,
  LuSave,
  LuLayers,
  LuUndo2,
  LuRedo2,
  LuEye,
  LuMessageCircle,
  LuEyeOff,
  LuPaintBucket,
  LuChevronUp,
  LuChevronDown,
  LuType,
  LuPencil,
  LuLock,
  LuLockOpen,
  LuShapes,
  LuSquare,
  LuCircle,
  LuMinus,
  LuStar,
  LuGroup,
  LuUngroup,
  LuCopy,
  LuLayoutTemplate,
  LuColumns2,
  LuRows2,
  LuColumns3,
  LuPanelsTopLeft,
  LuGrid3X3,
  LuGrid2X2,
  LuPanelTop,
  LuPanelRightOpen,
  LuPanelRightClose,
  LuPanelLeft,
  LuRefreshCw,
  LuChevronsDown,
  LuChevronsUp,
  LuImagePlus,
  LuMaximize2,
  LuPipette,
  LuZoomIn,
  LuZoomOut,
  LuAlignHorizontalJustifyCenter,
  LuAlignHorizontalJustifyEnd,
  LuAlignHorizontalJustifyStart,
  LuAlignHorizontalSpaceBetween,
  LuAlignVerticalJustifyCenter,
  LuAlignVerticalJustifyEnd,
  LuAlignVerticalJustifyStart,
  LuAlignVerticalSpaceBetween,
  LuCaptions,
  LuPanelBottom,
  LuStamp,
  LuZap,
  LuLoaderCircle,
  LuScanText,
  LuScanLine,
  LuFlipHorizontal2,
  LuFlipVertical2,
  LuWandSparkles,
  LuHistory,
  LuCheck,
  LuSlidersHorizontal,
  LuArrowUpToLine,
  LuArrowDownToLine,
  LuGitCompare,
  LuRotateCcw,
  LuDownload,
  LuArrowRight,
  LuArrowUpLeft,
  LuArrowUpRight,
  LuArrowDownLeft,
  LuArrowDownRight,
  LuGripVertical,
  LuX,
} from "react-icons/lu";
import {
  type SpeechBubble,
  type BubbleType,
  type TextStyleRun,
  BUBBLE_FONT_FAMILIES,
  createBubble,
  drawBubble,
  drawBubbleSelection,
  hitTestBubble,
  bubblePointToCanvas,
  canvasPointToBubble,
} from "@/lib/bubble-draw";
import CreditCostBadge from "@/components/CreditCostBadge";
import ImageModelSelector from "@/components/ImageModelSelector";
import { AI_CREDIT_COSTS, getGenerationCreditCost } from "@/lib/credit-products";
import { DEFAULT_IMAGE_MODEL_ID, type ImageModelId } from "@/lib/ai-pricing";
import {
  type CaptionSettings,
  type WatermarkPosition,
  type WatermarkSettings,
  DEFAULT_CAPTION_SETTINGS,
  DEFAULT_WATERMARK_SETTINGS,
  createCaptionBubble,
  createWatermarkBubble,
} from "@/lib/canvas-presets";

interface GalleryImage {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string | null;
  label?: string;
  view?: string;
}

type AssetLibraryTab = "project" | "character" | "gesture" | "background";
type CanvasTool = "move" | "crop" | "pipette" | "bubble" | "text" | "shape" | "brush" | "eraser" | "mask";
type RedrawRegionMode = "all" | "auto" | "rectangle" | "freehand";
type OcrRegionMode = "all" | "rectangle" | "freehand";
type PresetScope = "current" | "all" | "range";
type EraserApplyMode = "transparent" | "heal";
type ShapeToolType = "rectangle" | "circle" | "ellipse" | "line" | "arrow" | "star";

interface TextToolDefaults {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  fontWeight: 300 | 400 | 700 | 900;
  textAlign: "left" | "center" | "right";
  fontItalic: boolean;
  underline: boolean;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidth: number;
  lineHeightScale: number;
  letterSpacing: number;
}

interface ShapeToolDefaults {
  cornerRadius: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: NonNullable<SpeechBubble["strokeStyle"]>;
  fillColor: string;
  fillOpacity: number;
  gradientEnabled: boolean;
  gradientColor: string;
  gradientAngle: number;
  gradientStop: number;
}

export interface SavedCanvasImage {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface Layer {
  id: string;
  name: string;
  locked: boolean;
  groupId: string | null;
  image: HTMLImageElement | null;
  imageUrl: string | null;
  opacity: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fillColor: string | null;
  canvas: HTMLCanvasElement | null;
  pixelDirty: boolean;
  pixelRevision: number;
  bubbles: SpeechBubble[];
  filter: CanvasImageFilter;
  filterIntensity: number;
  clipToBelow: boolean;
  background: PageBackground | null;
}

type CanvasImageFilter = "original" | "grayscale" | "sepia" | "faded" | "warm" | "vintage";
type BackgroundTexture = "paper" | "dot" | "canvas";

interface PageBackground {
  type: "none" | "solid" | "linear" | "texture";
  color: string;
  color2: string;
  angle: number;
  stop: number;
  texture: BackgroundTexture;
}

const FILL_COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

const BRUSH_COLORS = ["#000000", "#ffffff", "#0ea5a8", "#f04452", "#ffb400", "#3182f6", "#00c853", "#8b95a1"] as const;
const DIRECT_DRAW_COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"] as const;
const TEXT_QUICK_SIZES = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 120] as const;

const DEFAULT_TEXT_TOOL: TextToolDefaults = {
  fontSize: 60,
  fontFamily: BUBBLE_FONT_FAMILIES[0].id,
  textColor: "#000000",
  fontWeight: 400,
  textAlign: "center",
  fontItalic: false,
  underline: false,
  outlineEnabled: false,
  outlineColor: "#ffffff",
  outlineWidth: 2,
  lineHeightScale: 1.16,
  letterSpacing: 0,
};

const DEFAULT_SHAPE_TOOL: ShapeToolDefaults = {
  cornerRadius: 0,
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 3,
  strokeStyle: "solid",
  fillColor: "#ffffff",
  fillOpacity: 0,
  gradientEnabled: false,
  gradientColor: "#c7c7c7",
  gradientAngle: 0,
  gradientStop: 50,
};

const IMAGE_FILTERS: Array<{ id: CanvasImageFilter; label: string }> = [
  { id: "original", label: "원본" },
  { id: "grayscale", label: "흑백" },
  { id: "sepia", label: "세피아" },
  { id: "faded", label: "바랜 필름" },
  { id: "warm", label: "노란 색감" },
  { id: "vintage", label: "오래된 사진" },
];

type BrushStyle = "ballpoint" | "pencil" | "marker" | "highlighter" | "brushPen";
const BRUSH_STYLES: Array<{ id: BrushStyle; label: string }> = [
  { id: "ballpoint", label: "볼펜" },
  { id: "pencil", label: "연필" },
  { id: "marker", label: "마커" },
  { id: "highlighter", label: "형광펜" },
  { id: "brushPen", label: "붓펜" },
];

const SFX_PRESETS = ["쾅!", "콰광!!", "쿵", "우당탕", "펑!", "휙", "슉!", "두근", "헉!", "짠!"] as const;

const DEFAULT_PAGE_BACKGROUND: PageBackground = {
  type: "solid",
  color: "#ffffff",
  color2: "#dbeafe",
  angle: 0,
  stop: 50,
  texture: "paper",
};

export type CanvasAspectRatio = "1:1" | "4:5" | "3:4" | "8:11" | "9:16" | "16:9";

export interface CanvasPageItem {
  id: string;
  order: number;
  title: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  canvas?: unknown;
}

interface Props {
  initialImage: GalleryImage;
  galleryImages: GalleryImage[];
  onClose: () => void;
  onSave: (image: SavedCanvasImage) => void;
  initialAspect?: CanvasAspectRatio;
  projectId?: string;
  cutId?: string;
  initialCanvas?: unknown;
  pages?: CanvasPageItem[];
  currentPageId?: string;
  onSelectPage?: (pageId: string) => void | Promise<void>;
  onAddPage?: () => void | Promise<void>;
  onDuplicatePage?: () => void | Promise<void>;
  onDeletePage?: () => void | Promise<void>;
  onMovePage?: (direction: "up" | "down") => void | Promise<void>;
  coverPageId?: string | null;
  onRenamePage?: (pageId: string, title: string) => void | Promise<void>;
  onSetCoverPage?: (pageId: string) => void | Promise<void>;
  onDownloadAllPages?: () => void | Promise<void>;
  onCanvasBatchChange?: () => void | Promise<void>;
}

interface CanvasVersionSummary {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  source: string;
  label?: string | null;
  createdAt: string;
}

interface SerializedCanvasLayer {
  id: string;
  name: string;
  locked: boolean;
  groupId: string | null;
  pixelUrl: string | null;
  opacity: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fillColor: string | null;
  bubbles: SpeechBubble[];
  filter?: CanvasImageFilter;
  filterIntensity?: number;
  clipToBelow?: boolean;
  background?: PageBackground | null;
}

interface SerializedCanvasState {
  version: 1 | 2;
  aspect: AspectRatio;
  width: number;
  height: number;
  layers: SerializedCanvasLayer[];
}

const MIN_CANVAS = 540;
const CANVAS_FONT_STYLESHEET_ID = "autocartoon-canvas-fonts";
const CANVAS_FONT_STYLESHEETS = [
  "https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Black+Han+Sans&family=Cute+Font&family=Diphylleia&family=Do+Hyeon&family=Dokdo&family=Dongle:wght@400;700&family=East+Sea+Dokdo&family=Gaegu:wght@300;400;700&family=Gamja+Flower&family=Gothic+A1:wght@400;700;900&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Grandiflora+One&family=Gugi&family=Hahmlet:wght@300;400;700;900&family=Hi+Melody&family=IBM+Plex+Sans+KR:wght@300;400;700&family=Jua&family=Kirang+Haerang&family=Nanum+Brush+Script&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@300;400;700;900&family=Noto+Serif+KR:wght@400;700&family=Orbit&family=Poor+Story&family=Single+Day&family=Song+Myung&family=Stylish&family=Sunflower:wght@300;500;700&family=Yeon+Sung&display=swap",
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/Cafe24Ssurround/Cafe24Ssurround.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/GangwonEduModu/GangwonEduModu.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/TmoneyRoundWind/TmoneyRoundWind.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/Jalnan/Jalnan.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/Cafe24SsurroundAir/Cafe24SsurroundAir.css",
  "https://cdn.jsdelivr.net/gh/fonts-archive/HakgyoansimAllimjang/HakgyoansimAllimjang.css",
  "https://cdn.jsdelivr.net/gh/sun-typeface/SUITE@2/fonts/static/woff2/SUITE.css",
] as const;
const CANVAS_CUSTOM_FONT_FACES = `
@font-face{font-family:'OngleipEoyeonce';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105@1.1/Uiyeun.woff') format('woff');font-display:swap}
@font-face{font-family:'Binggre';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/Binggrae.woff') format('woff');font-weight:400;font-display:swap}
@font-face{font-family:'Binggre';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/Binggrae-Bold.woff2') format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:'OngleipParkDahyeon';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/2411-3@1.0/Ownglyph_ParkDaHyun.woff2') format('woff2');font-display:swap}
@font-face{font-family:'KyoboHandwriting2019';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/KyoboHand.woff') format('woff');font-display:swap}
@font-face{font-family:'IsYun';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2202-2@1.0/LeeSeoyun.woff') format('woff');font-display:swap}
@font-face{font-family:'GriunCherry1Spoon';src:url('https://d26ciffk7xlrlz.cloudfront.net/free-fonts/cherry1spoon/Griun_Cherry1Spoon-Rg.woff2') format('woff2');font-display:swap}
@font-face{font-family:'GriunCocochoitoon';src:url('https://d26ciffk7xlrlz.cloudfront.net/free-fonts/cocochoitoon/Griun_Cocochoitoon-Rg.woff2') format('woff2');font-display:swap}
@font-face{font-family:'GriunMyoeunHeullim';src:url('https://d26ciffk7xlrlz.cloudfront.net/free-fonts/myoeunheullim/Griun_MyoeunHeullim-Rg.woff2') format('woff2');font-display:swap}
@font-face{font-family:'KyoboHandwriting2025';src:url('https://contents.kyobobook.co.kr/display/next/ui-store/build-1783478929/_next/static/media/92727ae68bd428cc-s.p.otf') format('opentype');font-display:swap}
`;
type AspectRatio = CanvasAspectRatio;

const ASPECT_CONFIG: Record<
  AspectRatio,
  { heightRatio: number; exportW: number; exportH: number }
> = {
  "1:1": { heightRatio: 1, exportW: 1080, exportH: 1080 },
  "4:5": { heightRatio: 5 / 4, exportW: 1080, exportH: 1350 },
  "3:4": { heightRatio: 4 / 3, exportW: 960, exportH: 1280 },
  "8:11": { heightRatio: 11 / 8, exportW: 800, exportH: 1100 },
  "9:16": { heightRatio: 16 / 9, exportW: 1080, exportH: 1920 },
  "16:9": { heightRatio: 9 / 16, exportW: 1920, exportH: 1080 },
};

function closestAspect(width: number, height: number): AspectRatio {
  const ratio = height / width;
  return (Object.keys(ASPECT_CONFIG) as AspectRatio[]).reduce((closest, candidate) =>
    Math.abs(ASPECT_CONFIG[candidate].heightRatio - ratio) <
    Math.abs(ASPECT_CONFIG[closest].heightRatio - ratio)
      ? candidate
      : closest
  );
}

function createLayer(id?: string, w = MIN_CANVAS, h = MIN_CANVAS): Layer {
  return {
    id: id || `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: "새 레이어",
    locked: false,
    groupId: null,
    image: null,
    imageUrl: null,
    opacity: 1,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width: w,
    height: h,
    visible: true,
    fillColor: null,
    canvas: null,
    pixelDirty: false,
    pixelRevision: 0,
    bubbles: [],
    filter: "original",
    filterIntensity: 1,
    clipToBelow: false,
    background: null,
  };
}

function parseSerializedCanvas(value: unknown): SerializedCanvasState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<SerializedCanvasState>;
  if (
    (state.version !== 1 && state.version !== 2) ||
    !state.aspect ||
    !(state.aspect in ASPECT_CONFIG) ||
    typeof state.width !== "number" ||
    typeof state.height !== "number" ||
    !Array.isArray(state.layers)
  ) return null;
  return state as SerializedCanvasState;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("레이어 이미지를 만들지 못했습니다.")), "image/png");
  });
}

function cloneCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")!.drawImage(source, 0, 0);
  return copy;
}

function cloneLayers(source: Layer[]): Layer[] {
  return source.map((layer) => {
    let clonedCanvas: HTMLCanvasElement | null = null;
    if (layer.canvas) {
      clonedCanvas = document.createElement("canvas");
      clonedCanvas.width = layer.canvas.width;
      clonedCanvas.height = layer.canvas.height;
      clonedCanvas.getContext("2d")!.drawImage(layer.canvas, 0, 0);
    }
    return {
      ...layer,
      canvas: clonedCanvas,
      bubbles: layer.bubbles.map((bubble) => ({ ...bubble })),
      background: layer.background ? { ...layer.background } : null,
    };
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function hydrateSerializedLayers(state: SerializedCanvasState): Promise<Layer[]> {
  return Promise.all(state.layers.map(async (saved) => {
    let image: HTMLImageElement | null = null;
    let layerCanvas: HTMLCanvasElement | null = null;
    if (saved.pixelUrl) {
      image = await loadImage(saved.pixelUrl);
      layerCanvas = document.createElement("canvas");
      layerCanvas.width = state.width;
      layerCanvas.height = state.height;
      layerCanvas.getContext("2d")!.drawImage(image, 0, 0, state.width, state.height);
    }
    return {
      ...createLayer(saved.id, state.width, state.height),
      ...saved,
      scale: typeof saved.scale === "number" ? Math.max(0.1, Math.min(4, saved.scale)) : 1,
      scaleX: typeof saved.scaleX === "number"
        ? Math.max(0.05, Math.min(8, saved.scaleX))
        : typeof saved.scale === "number" ? Math.max(0.05, Math.min(8, saved.scale)) : 1,
      scaleY: typeof saved.scaleY === "number"
        ? Math.max(0.05, Math.min(8, saved.scaleY))
        : typeof saved.scale === "number" ? Math.max(0.05, Math.min(8, saved.scale)) : 1,
      rotation: typeof saved.rotation === "number" ? Math.max(-180, Math.min(180, saved.rotation)) : 0,
      image,
      imageUrl: saved.pixelUrl,
      canvas: layerCanvas,
      pixelDirty: false,
      pixelRevision: 0,
      bubbles: saved.bubbles.map((bubble) => ({ ...bubble })),
      filter: IMAGE_FILTERS.some((filter) => filter.id === saved.filter) ? saved.filter! : "original",
      filterIntensity: typeof saved.filterIntensity === "number"
        ? Math.max(0, Math.min(1, saved.filterIntensity))
        : 1,
      clipToBelow: saved.clipToBelow === true,
      background: saved.background ? { ...saved.background } : null,
    } satisfies Layer;
  }));
}

function layerDrawRect(layer: Layer, canvasW: number, canvasH: number) {
  const scaleX = Math.max(0.05, Math.min(8, layer.scaleX || layer.scale || 1));
  const scaleY = Math.max(0.05, Math.min(8, layer.scaleY || layer.scale || 1));
  const width = canvasW * scaleX;
  const height = canvasH * scaleY;
  return {
    x: layer.x + (canvasW - width) / 2,
    y: layer.y + (canvasH - height) / 2,
    width,
    height,
  };
}

interface LayerBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

function getLayerHandleGeometry(
  bounds: LayerBounds,
  canvasW: number,
  canvasH: number,
  handleRadius: number
) {
  const inset = handleRadius * 1.6;
  const clampX = (value: number) => Math.max(inset, Math.min(canvasW - inset, value));
  const clampY = (value: number) => Math.max(inset, Math.min(canvasH - inset, value));
  const left = clampX(bounds.left);
  const right = clampX(bounds.right);
  const top = clampY(bounds.top);
  const bottom = clampY(bounds.bottom);
  const rotationOffset = Math.max(24, canvasW / 20);
  const rawRotationY = bounds.top - rotationOffset >= inset
    ? bounds.top - rotationOffset
    : bounds.top + rotationOffset;
  return {
    corners: [[left, top], [right, top], [right, bottom], [left, bottom]] as Array<[number, number]>,
    rotation: { x: clampX(bounds.centerX), y: clampY(rawRotationY) },
    rotationAnchor: { x: clampX(bounds.centerX), y: clampY(bounds.top) },
  };
}

interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const alphaBoundsCache = new WeakMap<HTMLCanvasElement, PixelBounds | null>();

function canvasAlphaBounds(canvas: HTMLCanvasElement): PixelBounds | null {
  if (alphaBoundsCache.has(canvas)) return alphaBoundsCache.get(canvas) ?? null;
  try {
    const { width, height } = canvas;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] < 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const bounds = maxX >= minX && maxY >= minY ? { minX, minY, maxX, maxY } : null;
    alphaBoundsCache.set(canvas, bounds);
    return bounds;
  } catch {
    alphaBoundsCache.set(canvas, null);
    return null;
  }
}

function rotatePoint(x: number, y: number, centerX: number, centerY: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cosine - dy * sine,
    y: centerY + dx * sine + dy * cosine,
  };
}

function drawLayerCanvas(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
  rotation: number
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  context.save();
  context.translate(centerX, centerY);
  context.rotate((rotation || 0) * Math.PI / 180);
  context.drawImage(canvas, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
  context.restore();
}

function imageFilterValue(filter: CanvasImageFilter, intensity: number) {
  const amount = Math.max(0, Math.min(1, intensity));
  switch (filter) {
    case "grayscale": return `grayscale(${amount})`;
    case "sepia": return `sepia(${amount})`;
    case "faded": return `saturate(${1 - amount * 0.55}) contrast(${1 - amount * 0.16}) brightness(${1 + amount * 0.12})`;
    case "warm": return `sepia(${amount * 0.28}) saturate(${1 + amount * 0.5}) hue-rotate(${-amount * 10}deg)`;
    case "vintage": return `sepia(${amount * 0.72}) saturate(${1 - amount * 0.24}) contrast(${1 - amount * 0.12}) brightness(${1 - amount * 0.04})`;
    default: return "none";
  }
}

function drawPageBackground(
  context: CanvasRenderingContext2D,
  background: PageBackground,
  width: number,
  height: number
) {
  if (background.type === "none") return;
  if (background.type === "linear") {
    const angle = (background.angle * Math.PI) / 180;
    const radius = Math.hypot(width, height) / 2;
    const cx = width / 2;
    const cy = height / 2;
    const gradient = context.createLinearGradient(
      cx - Math.cos(angle) * radius,
      cy - Math.sin(angle) * radius,
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius
    );
    const stop = Math.max(0.05, Math.min(0.95, background.stop / 100));
    gradient.addColorStop(0, background.color);
    gradient.addColorStop(stop, background.color);
    gradient.addColorStop(1, background.color2);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    return;
  }

  context.fillStyle = background.color;
  context.fillRect(0, 0, width, height);
  if (background.type !== "texture") return;
  context.save();
  if (background.texture === "dot") {
    const gap = Math.max(8, Math.round(Math.min(width, height) / 55));
    const radius = Math.max(0.8, gap * 0.1);
    context.fillStyle = "rgba(15, 15, 15, 0.17)";
    for (let y = gap / 2; y < height; y += gap) {
      for (let x = gap / 2; x < width; x += gap) {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (background.texture === "canvas") {
    const gap = Math.max(5, Math.round(Math.min(width, height) / 95));
    context.strokeStyle = "rgba(15, 15, 15, 0.1)";
    context.lineWidth = Math.max(0.6, gap * 0.08);
    for (let offset = 0; offset < width + height; offset += gap) {
      context.beginPath();
      context.moveTo(Math.max(0, offset - height), Math.min(height, offset));
      context.lineTo(Math.min(width, offset), Math.max(0, offset - width));
      context.stroke();
      context.beginPath();
      context.moveTo(Math.max(0, offset - height), height - Math.min(height, offset));
      context.lineTo(Math.min(width, offset), height - Math.max(0, offset - width));
      context.stroke();
    }
  } else {
    const count = Math.max(900, Math.round(width * height / 650));
    for (let index = 0; index < count; index += 1) {
      const x = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1 * width;
      const y = Math.abs(Math.sin(index * 78.233 + 4.13) * 24634.6345) % 1 * height;
      context.fillStyle = index % 2 === 0 ? "rgba(0,0,0,0.055)" : "rgba(255,255,255,0.07)";
      context.fillRect(x, y, 1, 1);
    }
  }
  context.restore();
}

function scaleBubbleForOutput(bubble: SpeechBubble, scaleX: number, scaleY: number): SpeechBubble {
  const textScale = Math.min(scaleX, scaleY);
  return {
    ...bubble,
    x: bubble.x * scaleX,
    y: bubble.y * scaleY,
    width: bubble.width * scaleX,
    height: bubble.height * scaleY,
    tailTipX: bubble.tailTipX * scaleX,
    tailTipY: bubble.tailTipY * scaleY,
    tailWidth: bubble.tailWidth * scaleX,
    strokeWidth: bubble.strokeWidth * Math.max(scaleX, scaleY),
    fontSize: (bubble.fontSize ?? 24) * textScale,
    outlineWidth: bubble.outlineWidth ? bubble.outlineWidth * Math.max(scaleX, scaleY) : undefined,
    letterSpacing: bubble.letterSpacing ? bubble.letterSpacing * textScale : undefined,
    cornerRadius: bubble.cornerRadius ? bubble.cornerRadius * textScale : undefined,
    textRuns: bubble.textRuns?.map((run) => ({
      ...run,
      baselineOffset: run.baselineOffset ? run.baselineOffset * textScale : undefined,
    })),
  };
}

function renderLayerBitmap(
  layer: Layer,
  canvasW: number,
  canvasH: number,
  outputW: number,
  outputH: number
) {
  const bitmap = document.createElement("canvas");
  bitmap.width = outputW;
  bitmap.height = outputH;
  const context = bitmap.getContext("2d")!;
  const scaleX = outputW / canvasW;
  const scaleY = outputH / canvasH;
  context.globalAlpha = layer.opacity;
  if (layer.background) {
    drawPageBackground(context, layer.background, outputW, outputH);
  } else if (layer.fillColor && !layer.canvas) {
    context.fillStyle = layer.fillColor;
    context.fillRect(0, 0, outputW, outputH);
  } else if (layer.canvas) {
    const rect = layerDrawRect(layer, canvasW, canvasH);
    context.filter = imageFilterValue(layer.filter, layer.filterIntensity);
    drawLayerCanvas(context, layer.canvas, {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    }, layer.rotation);
    context.filter = "none";
  }
  for (const bubble of layer.bubbles) {
    drawBubble(context, scaleBubbleForOutput(bubble, scaleX, scaleY));
  }
  return bitmap;
}

function renderCanvasLayers(
  context: CanvasRenderingContext2D,
  layers: Layer[],
  canvasW: number,
  canvasH: number,
  outputW = canvasW,
  outputH = canvasH,
  flattenWhite = false
) {
  context.clearRect(0, 0, outputW, outputH);
  if (flattenWhite) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputW, outputH);
  }
  let layerBelow: HTMLCanvasElement | null = null;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const bitmap = renderLayerBitmap(layer, canvasW, canvasH, outputW, outputH);
    if (layer.clipToBelow && layerBelow) {
      const bitmapContext = bitmap.getContext("2d")!;
      bitmapContext.globalCompositeOperation = "destination-in";
      bitmapContext.globalAlpha = 1;
      bitmapContext.drawImage(layerBelow, 0, 0);
      bitmapContext.globalCompositeOperation = "source-over";
    }
    context.drawImage(bitmap, 0, 0);
    layerBelow = bitmap;
  }
}

function canvasPointToLayer(layer: Layer, canvasW: number, canvasH: number, x: number, y: number) {
  const rect = layerDrawRect(layer, canvasW, canvasH);
  const point = rotatePoint(
    x,
    y,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    -(layer.rotation || 0)
  );
  return {
    x: (point.x - rect.x) * (layer.canvas?.width || canvasW) / rect.width,
    y: (point.y - rect.y) * (layer.canvas?.height || canvasH) / rect.height,
  };
}

function pointHitsLayerPixels(layer: Layer, canvasW: number, canvasH: number, x: number, y: number) {
  if (layer.background || (layer.fillColor && !layer.canvas)) return true;
  if (!layer.canvas) return false;
  const point = canvasPointToLayer(layer, canvasW, canvasH, x, y);
  const pixelX = Math.floor(point.x);
  const pixelY = Math.floor(point.y);
  if (pixelX < 0 || pixelY < 0 || pixelX >= layer.canvas.width || pixelY >= layer.canvas.height) {
    return false;
  }
  try {
    return layer.canvas.getContext("2d")!.getImageData(pixelX, pixelY, 1, 1).data[3] >= 8;
  } catch {
    const bounds = getLayerBounds(layer, canvasW, canvasH);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }
}

function getLayerBounds(layer: Layer, canvasW: number, canvasH: number): LayerBounds {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const include = (nextLeft: number, nextTop: number, nextRight: number, nextBottom: number) => {
    left = Math.min(left, nextLeft);
    top = Math.min(top, nextTop);
    right = Math.max(right, nextRight);
    bottom = Math.max(bottom, nextBottom);
  };

  if (layer.fillColor && !layer.canvas) include(0, 0, canvasW, canvasH);
  if (layer.canvas) {
    const rect = layerDrawRect(layer, canvasW, canvasH);
    const pixels = canvasAlphaBounds(layer.canvas);
    const source = pixels
      ? {
          left: rect.x + pixels.minX / layer.canvas.width * rect.width,
          top: rect.y + pixels.minY / layer.canvas.height * rect.height,
          right: rect.x + (pixels.maxX + 1) / layer.canvas.width * rect.width,
          bottom: rect.y + (pixels.maxY + 1) / layer.canvas.height * rect.height,
        }
      : { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const corners = [
      rotatePoint(source.left, source.top, centerX, centerY, layer.rotation),
      rotatePoint(source.right, source.top, centerX, centerY, layer.rotation),
      rotatePoint(source.right, source.bottom, centerX, centerY, layer.rotation),
      rotatePoint(source.left, source.bottom, centerX, centerY, layer.rotation),
    ];
    include(
      Math.min(...corners.map((point) => point.x)),
      Math.min(...corners.map((point) => point.y)),
      Math.max(...corners.map((point) => point.x)),
      Math.max(...corners.map((point) => point.y))
    );
  }
  for (const bubble of layer.bubbles) {
    include(
      bubble.x - bubble.width / 2,
      bubble.y - bubble.height / 2,
      bubble.x + bubble.width / 2,
      bubble.y + bubble.height / 2
    );
    if (bubble.tailEnabled) include(bubble.tailTipX, bubble.tailTipY, bubble.tailTipX, bubble.tailTipY);
  }
  if (!Number.isFinite(left)) include(layer.x, layer.y, layer.x + layer.width, layer.y + layer.height);
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function translateLayer(layer: Layer, dx: number, dy: number): Layer {
  return {
    ...layer,
    x: layer.x + dx,
    y: layer.y + dy,
    bubbles: layer.bubbles.map((bubble) => ({
      ...bubble,
      x: bubble.x + dx,
      y: bubble.y + dy,
      tailTipX: bubble.tailTipX + dx,
      tailTipY: bubble.tailTipY + dy,
    })),
  };
}

export default function CanvasEditor({
  initialImage,
  galleryImages,
  onClose,
  onSave,
  initialAspect,
  projectId,
  cutId,
  initialCanvas,
  pages = [],
  currentPageId,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  coverPageId,
  onRenamePage,
  onSetCoverPage,
  onDownloadAllPages,
  onCanvasBatchChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [tool, setTool] = useState<CanvasTool>("move");
  const [bubbleType, setBubbleType] = useState<BubbleType>("classic");
  const [shapeType, setShapeType] = useState<ShapeToolType>("rectangle");
  const [textToolDefaults, setTextToolDefaults] = useState<TextToolDefaults>({ ...DEFAULT_TEXT_TOOL });
  const [shapeToolDefaults, setShapeToolDefaults] = useState<ShapeToolDefaults>({ ...DEFAULT_SHAPE_TOOL });
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const bubbleDragMode = useRef<"none" | "move" | "resize" | "tail" | "rotate" | "create">("none");
  const bubbleDragHandle = useRef("");
  const bubbleDragStart = useRef({ x: 0, y: 0 });
  const bubbleOriginal = useRef<Partial<SpeechBubble>>({});
  const textSelectionRef = useRef({ start: 0, end: 0 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [canvasW, setCanvasW] = useState(MIN_CANVAS);
  const [canvasH, setCanvasH] = useState(MIN_CANVAS);
  const [brushColor, setBrushColor] = useState("#111111");
  const [brushSize, setBrushSize] = useState(12);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>("ballpoint");
  const [eraserApplyMode, setEraserApplyMode] = useState<EraserApplyMode>("transparent");
  const [eraserPending, setEraserPending] = useState(false);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showTransparencyGrid, setShowTransparencyGrid] = useState(true);
  const [showOverflow, setShowOverflow] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [toolPanelCollapsed, setToolPanelCollapsed] = useState(false);
  const [directDrawOpen, setDirectDrawOpen] = useState(false);
  const [textSizeMenuOpen, setTextSizeMenuOpen] = useState(false);
  // 텍스트 부분 선택 길이(0이면 전체 적용, >0이면 선택 범위에만 부분 서식 적용)
  const [textSelectionLen, setTextSelectionLen] = useState(0);
  // 다른 객체로 선택이 바뀌면 이전 텍스트의 선택 범위가 남지 않도록 초기화한다.
  useEffect(() => {
    textSelectionRef.current = { start: 0, end: 0 };
    setTextSelectionLen(0);
  }, [selectedBubbleId]);
  const [zoom, setZoom] = useState(100);
  const [fitScale, setFitScale] = useState(1);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrRegionMode, setOcrRegionMode] = useState<OcrRegionMode>("all");
  const [regionSelectionPurpose, setRegionSelectionPurpose] = useState<"redraw" | "ocr" | null>(null);
  const [cutoutLoading, setCutoutLoading] = useState(false);
  const [cutoutConfigured, setCutoutConfigured] = useState<boolean | null>(null);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawLoading, setRedrawLoading] = useState(false);
  const [redrawPrompt, setRedrawPrompt] = useState("");
  const [redrawImageModel, setRedrawImageModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL_ID);
  const [redrawImageSize, setRedrawImageSize] = useState<"1K" | "2K">("1K");
  const [redrawUseRegion, setRedrawUseRegion] = useState(false);
  const [redrawRegionMode, setRedrawRegionMode] = useState<RedrawRegionMode>("all");
  const [maskBrushSize, setMaskBrushSize] = useState(64);
  const [maskRevision, setMaskRevision] = useState(0);
  const [redrawJobId, setRedrawJobId] = useState<string | null>(null);
  const [redrawProgress, setRedrawProgress] = useState(0);
  // AI 영역 지정 모드: 크롭 도구로 사각형을 그리되 파괴적 크롭은 적용하지 않고
  // cropRect만 남겨 재생성 영역으로 재사용한다.
  const [aiRegionMode, setAiRegionMode] = useState(false);
  const aiMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aiMaskDrawing = useRef(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [assetTab, setAssetTab] = useState<AssetLibraryTab>("project");
  const [characterView, setCharacterView] = useState("front");
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const [layerPanelCollapsed, setLayerPanelCollapsed] = useState(false);
  const [assetPanelCollapsed, setAssetPanelCollapsed] = useState(true);
  const [pagePanelCollapsed, setPagePanelCollapsed] = useState(false);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const [layerPanelSide, setLayerPanelSide] = useState<"left" | "right">("right");
  const [layerDropTargetId, setLayerDropTargetId] = useState<string | null>(null);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  const [watermarkSettings, setWatermarkSettings] = useState<WatermarkSettings>({ ...DEFAULT_WATERMARK_SETTINGS });
  const [watermarkScope, setWatermarkScope] = useState<PresetScope>("current");
  const [watermarkRange, setWatermarkRange] = useState({ start: 1, end: Math.max(1, pages.length) });
  const [watermarkApplying, setWatermarkApplying] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionSettings, setCaptionSettings] = useState<CaptionSettings>({ ...DEFAULT_CAPTION_SETTINGS });
  const [captionApplying, setCaptionApplying] = useState(false);
  const [exportingPages, setExportingPages] = useState(false);
  const [customBubbleOpen, setCustomBubbleOpen] = useState(false);
  // 커스텀 말풍선 라이브러리: 생성기에서 저장한 모양을 재사용한다(이 브라우저 로컬 저장).
  const [bubbleLibrary, setBubbleLibrary] = useState<SpeechBubble[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<CanvasVersionSummary[]>([]);
  const [historySelection, setHistorySelection] = useState<string[]>([]);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [assetLibrary, setAssetLibrary] = useState<Record<Exclude<AssetLibraryTab, "project">, GalleryImage[]>>({
    character: [],
    gesture: [],
    background: [],
  });
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(true);
  const drawing = useRef(false);
  const drawingLayerRef = useRef<{ id: string; canvas: HTMLCanvasElement; layer: Layer } | null>(null);
  const brushLastPoint = useRef({ x: 0, y: 0, at: 0 });
  const eraserMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eraserLayerIdRef = useRef<string | null>(null);
  const eraserDrawingRef = useRef(false);
  const eraserStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const copiedLayerRef = useRef<Layer | null>(null);
  const initializedSourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (document.getElementById(CANVAS_FONT_STYLESHEET_ID)) return;
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://fonts.gstatic.com";
    preconnect.crossOrigin = "anonymous";
    preconnect.dataset.canvasFont = "preconnect";
    const stylesheets = CANVAS_FONT_STYLESHEETS.map((href) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = href;
      stylesheet.dataset.canvasFont = "stylesheet";
      return stylesheet;
    });
    const customFonts = document.createElement("style");
    customFonts.id = CANVAS_FONT_STYLESHEET_ID;
    customFonts.textContent = CANVAS_CUSTOM_FONT_FACES;
    document.head.append(preconnect, ...stylesheets, customFonts);
    const refreshCanvasFonts = () => setMaskRevision((value) => value + 1);
    document.fonts.addEventListener("loadingdone", refreshCanvasFonts);
    void document.fonts.ready.then(refreshCanvasFonts);
    return () => document.fonts.removeEventListener("loadingdone", refreshCanvasFonts);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/studio/remove-background", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (active) setCutoutConfigured(response.ok && data.configured === true);
      })
      .catch(() => {
        if (active) setCutoutConfigured(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setWatermarkRange((current) => ({
      start: Math.max(1, Math.min(Math.max(1, pages.length), current.start)),
      end: Math.max(1, pages.length),
    }));
  }, [pages.length]);

  const undoStack = useRef<Layer[][]>([]);
  const redoStack = useRef<Layer[][]>([]);
  const pointerChangeCommitted = useRef(false);
  const [, rerenderHistory] = useState(0);

  // 항상 최신 layers를 가리키는 ref. undo/redo가 setLayers 업데이터 안에서
  // 스택을 밀어넣으면(부작용) StrictMode에서 업데이터가 두 번 실행돼 스택이
  // 중복 push되므로, 스택 조작은 업데이터 밖에서 순수하게 처리한다.
  const layersRef = useRef<Layer[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const saveUndo = useCallback(() => {
    undoStack.current.push(cloneLayers(layers));
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    setDirty(true);
    rerenderHistory((value) => value + 1);
  }, [layers]);

  const commitPointerUndo = () => {
    if (pointerChangeCommitted.current) return;
    undoStack.current.push(cloneLayers(layersRef.current));
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    pointerChangeCommitted.current = true;
    setDirty(true);
    rerenderHistory((value) => value + 1);
  };

  const handleUndo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(cloneLayers(layersRef.current));
    setLayers(cloneLayers(previous));
    setDirty(true);
    rerenderHistory((value) => value + 1);
  }, []);

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(cloneLayers(layersRef.current));
    setLayers(cloneLayers(next));
    setDirty(true);
    rerenderHistory((value) => value + 1);
  }, []);

  const toggleActiveLayerLock = useCallback(() => {
    if (!activeLayerId) return;
    saveUndo();
    setLayers((current) => current.map((layer) =>
      layer.id === activeLayerId ? { ...layer, locked: !layer.locked } : layer
    ));
  }, [activeLayerId, saveUndo]);

  // 활성 레이어를 좌우/상하로 뒤집는다. 변형 상태를 어긋나게 두지 않도록 픽셀에 직접 반영한다.
  const flipActiveLayer = useCallback((direction: "h" | "v") => {
    if (!activeLayerId) return;
    saveUndo();
    setLayers((current) => current.map((layer) => {
      if (layer.id !== activeLayerId || !layer.canvas || layer.locked) return layer;
      const flipped = document.createElement("canvas");
      flipped.width = layer.canvas.width;
      flipped.height = layer.canvas.height;
      const ctx = flipped.getContext("2d")!;
      if (direction === "h") {
        ctx.translate(flipped.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, flipped.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(layer.canvas, 0, 0);
      // 회전된 레이어를 화면 기준으로 올바르게 미러링하려면 회전 방향도 뒤집어야 한다
      // (Flip∘R 이 되도록 rotation 부호를 반전).
      return {
        ...layer,
        canvas: flipped,
        rotation: -(layer.rotation || 0),
        pixelDirty: true,
        pixelRevision: layer.pixelRevision + 1,
      };
    }));
  }, [activeLayerId, saveUndo]);

  // Ctrl+Z / Cmd+Z 키보드 핸들러
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 텍스트 입력 중에는 캔버스 단축키를 가로채지 않는다(네이티브 텍스트 undo 보존 등).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleActiveLayerLock();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRedo, handleUndo, toggleActiveLayerLock]);

  // 드래그 이동
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragLayerStarts = useRef(new Map<string, Layer>());
  const layerTransformMode = useRef<"none" | "resize" | "rotate">("none");
  const layerTransformStart = useRef({
    layerId: "",
    centerX: 0,
    centerY: 0,
    distance: 1,
    pointerAngle: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  });

  // 크롭
  const [cropping, setCropping] = useState(false);
  const cropStart = useRef({ x: 0, y: 0 });
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 초기 이미지 로드
  useEffect(() => {
    const sourceKey = cutId || initialImage.id;
    if (initializedSourceRef.current === sourceKey) return;
    initializedSourceRef.current = sourceKey;
    undoStack.current = [];
    redoStack.current = [];
    setSelectedBubbleId(null);
    setSelectedLayerIds([]);
    (async () => {
      try {
        const persisted = parseSerializedCanvas(initialCanvas);
        if (persisted && persisted.layers.length > 0) {
          const restored = await hydrateSerializedLayers(persisted);
          setCanvasW(persisted.width);
          setCanvasH(persisted.height);
          setAspect(persisted.aspect);
          setLayers(restored);
          setActiveLayerId(restored[restored.length - 1].id);
          setDirty(false);
          return;
        }
        const img = await loadImage(initialImage.dataUrl);
        const targetAspect = initialAspect ?? closestAspect(img.width, img.height);
        const heightRatio = ASPECT_CONFIG[targetAspect].heightRatio;
        const cw = Math.max(img.width, Math.ceil(img.height / heightRatio), MIN_CANVAS);
        const ch = Math.round(cw * heightRatio);
        setCanvasW(cw);
        setCanvasH(ch);
        setAspect(targetAspect);

        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = cw;
        layerCanvas.height = ch;
        const ctx = layerCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, ch);
        // 원본 이미지를 캔버스 중앙에 원본 크기로
        const x = (cw - img.width) / 2;
        const y = (ch - img.height) / 2;
        ctx.drawImage(img, x, y);

        const layer: Layer = {
          ...createLayer("layer_initial", cw, ch),
          image: img,
          imageUrl: initialImage.dataUrl,
          name: "원본 이미지",
          canvas: layerCanvas,
          pixelDirty: true,
          pixelRevision: 1,
          width: cw,
          height: ch,
        };
        setLayers([layer]);
        setActiveLayerId(layer.id);
        setDirty(false);
      } catch {
        const layer = createLayer("layer_initial", MIN_CANVAS, MIN_CANVAS);
        setLayers([layer]);
        setActiveLayerId(layer.id);
        setDirty(false);
      }
    })();
  }, [cutId, initialAspect, initialCanvas, initialImage.dataUrl, initialImage.id]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const updateFitScale = () => {
      const availableWidth = Math.max(120, viewport.clientWidth - 24);
      const availableHeight = Math.max(120, viewport.clientHeight - 24);
      setFitScale(Math.min(1, availableWidth / canvasW, availableHeight / canvasH));
    };
    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [canvasH, canvasW]);

  useEffect(() => {
    let active = true;
    setAssetLibraryLoading(true);
    void Promise.allSettled([
      fetch("/api/presets", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/archive?kind=gesture&page=1", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/archive?kind=background&page=1", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([presetResult, gestureResult, backgroundResult]) => {
      if (!active) return;
      const presetData = presetResult.status === "fulfilled" ? presetResult.value : {};
      const gestureData = gestureResult.status === "fulfilled" ? gestureResult.value : {};
      const backgroundData = backgroundResult.status === "fulfilled" ? backgroundResult.value : {};
      const presets = [
        ...(Array.isArray(presetData.ungrouped) ? presetData.ungrouped : []),
        ...(Array.isArray(presetData.groups) ? presetData.groups.flatMap((group: { presets?: unknown[] }) => Array.isArray(group.presets) ? group.presets : []) : []),
      ] as Array<{ id: string; name: string; images?: Array<{ id: string; view: string; dataUrl: string; thumbnailUrl?: string | null }> }>;
      const archiveImages = (data: unknown): GalleryImage[] => {
        if (!data || typeof data !== "object" || Array.isArray(data)) return [];
        const items = (data as { items?: unknown }).items;
        if (!Array.isArray(items)) return [];
        return items.flatMap((item): GalleryImage[] => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const record = item as Record<string, unknown>;
          if (record.mediaType !== "image" || typeof record.url !== "string") return [];
          return [{
            id: String(record.key || record.id || record.url),
            dataUrl: record.url,
            thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : record.url,
            label: typeof record.prompt === "string" ? record.prompt : "생성 이미지",
          }];
        });
      };
      setAssetLibrary({
        character: presets.flatMap((preset) => (preset.images || []).map((image) => ({
          id: `preset:${preset.id}:${image.id}`,
          dataUrl: image.dataUrl,
          thumbnailUrl: image.thumbnailUrl || image.dataUrl,
          label: `${preset.name} · ${image.view}`,
          view: image.view,
        }))),
        gesture: archiveImages(gestureData),
        background: archiveImages(backgroundData),
      });
    }).finally(() => {
      if (active) setAssetLibraryLoading(false);
    });
    return () => { active = false; };
  }, [assetReloadVersion]);

  // 캔버스 렌더링
  const render = useCallback(() => {
    void maskRevision;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    renderCanvasLayers(ctx, layers, canvasW, canvasH);

    const editMask = aiMaskCanvasRef.current;
    if (editMask && (redrawOpen || ocrOpen || tool === "mask")) {
      const overlay = document.createElement("canvas");
      overlay.width = canvasW;
      overlay.height = canvasH;
      const overlayContext = overlay.getContext("2d")!;
      overlayContext.fillStyle = "rgba(239, 68, 68, 0.48)";
      overlayContext.fillRect(0, 0, canvasW, canvasH);
      overlayContext.globalCompositeOperation = "destination-in";
      overlayContext.drawImage(editMask, 0, 0);
      ctx.drawImage(overlay, 0, 0);
    }

    const eraserMask = eraserMaskCanvasRef.current;
    if (eraserMask && tool === "eraser") {
      const overlay = document.createElement("canvas");
      overlay.width = canvasW;
      overlay.height = canvasH;
      const overlayContext = overlay.getContext("2d")!;
      overlayContext.fillStyle = eraserApplyMode === "heal"
        ? "rgba(49, 130, 246, 0.5)"
        : "rgba(240, 68, 82, 0.5)";
      overlayContext.fillRect(0, 0, canvasW, canvasH);
      overlayContext.globalCompositeOperation = "destination-in";
      overlayContext.drawImage(eraserMask, 0, 0);
      ctx.drawImage(overlay, 0, 0);
    }

    if (!selectedBubbleId && tool === "move") {
      const selectedLayer = layers.find((layer) => layer.id === activeLayerId && layer.visible);
      if (selectedLayer) {
        const bounds = getLayerBounds(selectedLayer, canvasW, canvasH);
        const overflows = bounds.left < 0 || bounds.top < 0 || bounds.right > canvasW || bounds.bottom > canvasH;
        ctx.save();
        ctx.strokeStyle = overflows && showOverflow ? "#ef4444" : "#14b8a6";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = Math.max(2, canvasW / 500);
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
        ctx.setLineDash([]);
        const handleRadius = Math.max(7, canvasW / 120);
        const handles = getLayerHandleGeometry(bounds, canvasW, canvasH, handleRadius);
        for (const [x, y] of handles.corners) {
          ctx.beginPath();
          ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(handles.rotationAnchor.x, handles.rotationAnchor.y);
        ctx.lineTo(handles.rotation.x, handles.rotation.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(handles.rotation.x, handles.rotation.y, handleRadius * 1.15, 0, Math.PI * 2);
        ctx.fill();
        if (overflows && showOverflow) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
          ctx.lineWidth = Math.max(4, canvasW / 250);
          ctx.strokeRect(2, 2, canvasW - 4, canvasH - 4);
        }
        ctx.restore();
      }
    }

    // 선택된 말풍선 오버레이
    if (selectedBubbleId) {
      for (const layer of layers) {
        const bubble = layer.bubbles.find((b) => b.id === selectedBubbleId);
        if (bubble) {
          drawBubbleSelection(ctx, bubble);
          break;
        }
      }
    }

    // 크롭 영역 표시
    if (cropRect && tool === "crop") {
      ctx.save();
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      // 어두운 오버레이
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, canvasW, cropRect.y);
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h);
      ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, canvasW - cropRect.x - cropRect.w, cropRect.h);
      ctx.fillRect(0, cropRect.y + cropRect.h, canvasW, canvasH - cropRect.y - cropRect.h);
      ctx.restore();
    }

    if (showGuides) {
      ctx.save();
      ctx.strokeStyle = "rgba(20, 184, 166, 0.82)";
      ctx.lineWidth = Math.max(1, canvasW / 900);
      ctx.setLineDash([7, 6]);
      for (const x of [canvasW / 3, canvasW / 2, canvasW * 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasH);
        ctx.stroke();
      }
      for (const y of [canvasH / 3, canvasH / 2, canvasH * 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasW, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [activeLayerId, layers, cropRect, tool, canvasH, canvasW, selectedBubbleId, showGuides, showOverflow, redrawOpen, ocrOpen, maskRevision, eraserApplyMode]);

  useEffect(() => {
    render();
  }, [render]);

  // CSS 스케일 보정된 마우스 좌표
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // 마우스 이벤트 (이동 / 크롭)
  const handleMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x: mx, y: my } = getCanvasCoords(e);

    if (tool === "mask") {
      let mask = aiMaskCanvasRef.current;
      if (!mask || mask.width !== canvasW || mask.height !== canvasH) {
        mask = document.createElement("canvas");
        mask.width = canvasW;
        mask.height = canvasH;
        aiMaskCanvasRef.current = mask;
      }
      const context = mask.getContext("2d")!;
      context.save();
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "#ffffff";
      context.lineWidth = maskBrushSize;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(mx, my);
      aiMaskDrawing.current = true;
      if (regionSelectionPurpose === "ocr") {
        setOcrRegionMode("freehand");
      } else {
        setRedrawUseRegion(true);
        setRedrawRegionMode("freehand");
      }
      setMaskRevision((value) => value + 1);
    } else if (tool === "pipette") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pixel = canvas.getContext("2d")?.getImageData(
        Math.max(0, Math.min(canvas.width - 1, Math.floor(mx))),
        Math.max(0, Math.min(canvas.height - 1, Math.floor(my))),
        1,
        1
      ).data;
      if (pixel && pixel[3] > 0) {
        setBrushColor(`#${[pixel[0], pixel[1], pixel[2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
      }
      setTool("brush");
    } else if (tool === "eraser" && directDrawOpen) {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (!activeLayer?.canvas || activeLayer.locked) {
        setEditorMessage("직접 지울 이미지 또는 브러시 레이어를 먼저 선택해주세요.");
        return;
      }
      saveUndo();
      const context = activeLayer.canvas.getContext("2d")!;
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 1;
      context.lineWidth = brushSize;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      const point = canvasPointToLayer(activeLayer, canvasW, canvasH, mx, my);
      context.moveTo(point.x, point.y);
      brushLastPoint.current = { ...point, at: performance.now() };
      drawingLayerRef.current = { id: activeLayer.id, canvas: activeLayer.canvas, layer: activeLayer };
      drawing.current = true;
      setLayers((current) => current.map((layer) => layer.id === activeLayer.id
        ? { ...layer, pixelDirty: true, pixelRevision: layer.pixelRevision + 1 }
        : layer));
    } else if (tool === "eraser") {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (!activeLayer?.canvas || activeLayer.locked) {
        setEditorMessage("지울 이미지 레이어를 먼저 선택해주세요.");
        return;
      }
      if (eraserLayerIdRef.current !== activeLayer.id) {
        eraserMaskCanvasRef.current = null;
        eraserStrokesRef.current = [];
        eraserLayerIdRef.current = activeLayer.id;
      }
      let mask = eraserMaskCanvasRef.current;
      if (!mask || mask.width !== canvasW || mask.height !== canvasH) {
        mask = document.createElement("canvas");
        mask.width = canvasW;
        mask.height = canvasH;
        eraserMaskCanvasRef.current = mask;
      }
      const context = mask.getContext("2d")!;
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.strokeStyle = "#ffffff";
      context.lineWidth = brushSize;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(mx, my);
      const stroke = [{ x: mx, y: my }];
      eraserStrokesRef.current.push(stroke);
      eraserDrawingRef.current = true;
      setEraserPending(true);
      setMaskRevision((value) => value + 1);
    } else if (tool === "brush") {
      let activeLayer = layers.find((layer) => layer.id === activeLayerId);
      saveUndo();
      if (!activeLayer || activeLayer.locked) {
        const newCanvas = document.createElement("canvas");
        newCanvas.width = canvasW;
        newCanvas.height = canvasH;
        activeLayer = {
          ...createLayer(undefined, canvasW, canvasH),
          name: "브러시 선",
          canvas: newCanvas,
          pixelDirty: true,
          pixelRevision: 1,
        };
        setLayers((current) => [...current, activeLayer!]);
        setActiveLayerId(activeLayer.id);
      }
      let drawingCanvas = activeLayer.canvas;
      if (!drawingCanvas) {
        drawingCanvas = document.createElement("canvas");
        drawingCanvas.width = canvasW;
        drawingCanvas.height = canvasH;
        if (activeLayer.fillColor) {
          const fill = drawingCanvas.getContext("2d")!;
          fill.fillStyle = activeLayer.fillColor;
          fill.fillRect(0, 0, canvasW, canvasH);
        }
        const nextCanvas = drawingCanvas;
        setLayers((current) => current.map((layer) =>
          layer.id === activeLayerId
            ? {
                ...layer,
                canvas: nextCanvas,
                fillColor: null,
                pixelDirty: true,
                pixelRevision: layer.pixelRevision + 1,
              }
            : layer
        ));
      } else {
        setLayers((current) => current.map((layer) =>
          layer.id === activeLayerId
            ? { ...layer, pixelDirty: true, pixelRevision: layer.pixelRevision + 1 }
            : layer
        ));
      }
      const ctx = drawingCanvas.getContext("2d")!;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
      ctx.globalAlpha = brushStyle === "pencil" ? 0.58
          : brushStyle === "highlighter" ? 0.28
            : brushStyle === "marker" ? 0.82
              : 1;
      ctx.lineWidth = brushStyle === "pencil"
        ? brushSize * 0.72
        : brushStyle === "marker" ? brushSize * 1.18
          : brushStyle === "highlighter" ? brushSize * 1.8
            : brushSize;
      ctx.lineCap = brushStyle === "marker" || brushStyle === "highlighter" ? "square" : "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const point = canvasPointToLayer(activeLayer, canvasW, canvasH, mx, my);
      ctx.moveTo(point.x, point.y);
      brushLastPoint.current = { ...point, at: performance.now() };
      drawingLayerRef.current = { id: activeLayer.id, canvas: drawingCanvas, layer: activeLayer };
      drawing.current = true;
    } else if (tool === "move") {
      const activeTransformLayer = layers.find((layer) => layer.id === activeLayerId && layer.visible && !layer.locked);
      if (activeTransformLayer && !selectedBubbleId) {
        const bounds = getLayerBounds(activeTransformLayer, canvasW, canvasH);
        const hitRadius = Math.max(24, canvasW / 30);
        const handles = getLayerHandleGeometry(bounds, canvasW, canvasH, Math.max(7, canvasW / 120));
        const cornerHit = handles.corners.some(([x, y]) => Math.hypot(mx - x, my - y) <= hitRadius);
        const rotationHit = Math.hypot(mx - handles.rotation.x, my - handles.rotation.y) <= hitRadius;
        if (cornerHit || rotationHit) {
          pointerChangeCommitted.current = false;
          const centerX = activeTransformLayer.x + canvasW / 2;
          const centerY = activeTransformLayer.y + canvasH / 2;
          layerTransformMode.current = rotationHit ? "rotate" : "resize";
          layerTransformStart.current = {
            layerId: activeTransformLayer.id,
            centerX,
            centerY,
            distance: Math.max(1, Math.hypot(mx - centerX, my - centerY)),
            pointerAngle: Math.atan2(my - centerY, mx - centerX) * 180 / Math.PI,
            scaleX: activeTransformLayer.scaleX,
            scaleY: activeTransformLayer.scaleY,
            rotation: activeTransformLayer.rotation,
          };
          return;
        }
      }
      // 가장 위에 보이는 말풍선부터 선택한다.
      for (const layer of [...layers].reverse()) {
        if (!layer.visible || layer.locked) continue;
        for (const bubble of [...layer.bubbles].reverse()) {
          const hit = hitTestBubble(mx, my, bubble);
          if (hit) {
            pointerChangeCommitted.current = false;
            setActiveLayerId(layer.id);
            setSelectedBubbleId(bubble.id);
            bubbleDragStart.current = { x: mx, y: my };
            bubbleOriginal.current = { ...bubble };
            if (hit === "body") bubbleDragMode.current = "move";
            else if (hit === "tail") bubbleDragMode.current = "tail";
            else if (hit === "rotate") bubbleDragMode.current = "rotate";
            else { bubbleDragMode.current = "resize"; bubbleDragHandle.current = hit; }
            return;
          }
        }
      }

      // 말풍선이 아니면 실제 불투명 영역이 맞는 최상단 레이어를 선택한다.
      setSelectedBubbleId(null);
      const selectedLayer = [...layers].reverse().find((layer) => {
        if (!layer.visible || layer.locked) return false;
        return pointHitsLayerPixels(layer, canvasW, canvasH, mx, my);
      });
      if (!selectedLayer) {
        setActiveLayerId("");
        setSelectedLayerIds([]);
        return;
      }
      setActiveLayerId(selectedLayer.id);
      const movingLayers = selectedLayer.groupId
        ? layers.filter((layer) => layer.groupId === selectedLayer.groupId)
        : [selectedLayer];
      if (movingLayers.some((layer) => layer.locked)) return;
      pointerChangeCommitted.current = false;
      isDragging.current = true;
      dragStart.current = { x: mx, y: my };
      dragLayerStarts.current = new Map(
        movingLayers.map((layer) => [layer.id, { ...layer, bubbles: layer.bubbles.map((bubble) => ({ ...bubble })) }])
      );
    } else if (tool === "crop") {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (activeLayer?.locked) return;
      if (activeLayer && Math.abs(activeLayer.rotation) > 0.01) {
        setEditorMessage("크롭 전에 이미지 회전을 0°로 초기화해주세요.");
        return;
      }
      setCropping(true);
      cropStart.current = { x: mx, y: my };
      setCropRect({ x: mx, y: my, w: 0, h: 0 });
    } else if (tool === "bubble" || tool === "text" || tool === "shape") {
      // 활성 레이어의 말풍선/텍스트 히트 테스트
      const activeLayer = layers.find((l) => l.id === activeLayerId);

      // 선택된 말풍선부터 체크
      for (const bubble of [...(activeLayer && !activeLayer.locked ? activeLayer.bubbles : [])].reverse()) {
        const hit = hitTestBubble(mx, my, bubble);
        if (hit) {
          pointerChangeCommitted.current = false;
          setSelectedBubbleId(bubble.id);
          bubbleDragStart.current = { x: mx, y: my };
          bubbleOriginal.current = { ...bubble };

          if (hit === "body") {
            bubbleDragMode.current = "move";
          } else if (hit === "tail") {
            bubbleDragMode.current = "tail";
          } else if (hit === "rotate") {
            bubbleDragMode.current = "rotate";
          } else {
            bubbleDragMode.current = "resize";
            bubbleDragHandle.current = hit;
          }
          return;
        }
      }

      // 아무것도 안 맞으면 새 말풍선 또는 독립 텍스트 생성
      saveUndo();
      const requestedShapeType: BubbleType = shapeType === "circle"
        ? "ellipse"
        : shapeType === "rectangle" && shapeToolDefaults.cornerRadius > 0
          ? "roundedRectangle"
          : shapeType;
      const baseBubble = createBubble(
        tool === "text" ? "text" : tool === "shape" ? requestedShapeType : bubbleType,
        mx,
        my
      );
      const newBubble: SpeechBubble = tool === "text"
        ? {
            ...baseBubble,
            fontSize: textToolDefaults.fontSize,
            fontFamily: textToolDefaults.fontFamily,
            textColor: textToolDefaults.textColor,
            fontWeight: textToolDefaults.fontWeight,
            textAlign: textToolDefaults.textAlign,
            fontItalic: textToolDefaults.fontItalic,
            underline: textToolDefaults.underline,
            outlineColor: textToolDefaults.outlineEnabled ? textToolDefaults.outlineColor : undefined,
            outlineWidth: textToolDefaults.outlineEnabled ? textToolDefaults.outlineWidth : 0,
            lineHeightScale: textToolDefaults.lineHeightScale,
            letterSpacing: textToolDefaults.letterSpacing,
          }
        : tool === "shape"
          ? {
              ...baseBubble,
              width: shapeType === "circle" ? 180 : baseBubble.width,
              height: shapeType === "circle" ? 180 : baseBubble.height,
              cornerRadius: shapeToolDefaults.cornerRadius,
              strokeColor: shapeToolDefaults.strokeEnabled ? shapeToolDefaults.strokeColor : "transparent",
              strokeWidth: shapeToolDefaults.strokeEnabled ? shapeToolDefaults.strokeWidth : 0,
              strokeStyle: shapeToolDefaults.strokeStyle,
              fillColor: shapeToolDefaults.fillColor,
              fillOpacity: shapeToolDefaults.fillOpacity,
              gradientColor: shapeToolDefaults.gradientEnabled ? shapeToolDefaults.gradientColor : undefined,
              gradientAngle: shapeToolDefaults.gradientAngle,
              gradientStop: shapeToolDefaults.gradientStop,
            }
          : { ...baseBubble, textColor: brushColor };
      pointerChangeCommitted.current = true;
      bubbleDragMode.current = "create";
      bubbleDragStart.current = { x: mx, y: my };
      bubbleOriginal.current = { ...newBubble };
      if (activeLayer && !activeLayer.locked) {
        setLayers((prev) => prev.map((l) =>
          l.id === activeLayer.id ? { ...l, bubbles: [...l.bubbles, newBubble] } : l
        ));
      } else {
        const layer = {
          ...createLayer(undefined, canvasW, canvasH),
          name: tool === "text" ? "텍스트" : tool === "shape" ? "도형" : "말풍선",
          bubbles: [newBubble],
        };
        setLayers((prev) => [...prev, layer]);
        setActiveLayerId(layer.id);
      }
      setSelectedBubbleId(newBubble.id);
    }
  };

  const handleMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x: mx, y: my } = getCanvasCoords(e);

    if (tool === "mask" && aiMaskDrawing.current && aiMaskCanvasRef.current) {
      const context = aiMaskCanvasRef.current.getContext("2d")!;
      context.lineTo(mx, my);
      context.stroke();
      setMaskRevision((value) => value + 1);
      return;
    }

    if (tool === "eraser" && !directDrawOpen && eraserDrawingRef.current && eraserMaskCanvasRef.current) {
      const context = eraserMaskCanvasRef.current.getContext("2d")!;
      context.lineTo(mx, my);
      context.stroke();
      eraserStrokesRef.current.at(-1)?.push({ x: mx, y: my });
      setMaskRevision((value) => value + 1);
      return;
    }

    if ((tool === "brush" || (tool === "eraser" && directDrawOpen)) && drawing.current) {
      const drawingLayer = drawingLayerRef.current;
      const activeLayer = drawingLayer
        ? layersRef.current.find((layer) => layer.id === drawingLayer.id) ?? drawingLayer.layer
        : layers.find((layer) => layer.id === activeLayerId);
      if (!drawingLayer || !activeLayer) return;
      const ctx = drawingLayer.canvas.getContext("2d")!;
      const point = canvasPointToLayer(activeLayer, canvasW, canvasH, mx, my);
      if (tool === "brush" && brushStyle === "brushPen") {
        const elapsed = Math.max(1, performance.now() - brushLastPoint.current.at);
        const distance = Math.hypot(point.x - brushLastPoint.current.x, point.y - brushLastPoint.current.y);
        const speed = distance / elapsed;
        ctx.lineWidth = Math.max(brushSize * 0.45, Math.min(brushSize * 1.45, brushSize * (1.35 - speed * 0.2)));
      }
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      brushLastPoint.current = { ...point, at: performance.now() };
      alphaBoundsCache.delete(drawingLayer.canvas);
      setLayers((current) => [...current]);
      return;
    }

    if (tool === "move" && layerTransformMode.current !== "none") {
      const start = layerTransformStart.current;
      commitPointerUndo();
      if (layerTransformMode.current === "resize") {
        const distance = Math.max(1, Math.hypot(mx - start.centerX, my - start.centerY));
        const ratio = distance / start.distance;
        setLayers((current) => current.map((layer) => layer.id === start.layerId
          ? {
              ...layer,
              scale: Math.max(0.05, Math.min(8, ((start.scaleX + start.scaleY) / 2) * ratio)),
              scaleX: Math.max(0.05, Math.min(8, start.scaleX * ratio)),
              scaleY: Math.max(0.05, Math.min(8, start.scaleY * ratio)),
            }
          : layer));
      } else {
        const pointerAngle = Math.atan2(my - start.centerY, mx - start.centerX) * 180 / Math.PI;
        let rotation = start.rotation + pointerAngle - start.pointerAngle;
        rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        setLayers((current) => current.map((layer) => layer.id === start.layerId
          ? { ...layer, rotation }
          : layer));
      }
      return;
    }

    // move 도구에서도 말풍선 드래그 처리
    if ((tool === "move" || tool === "bubble" || tool === "text" || tool === "shape") && bubbleDragMode.current !== "none" && selectedBubbleId) {
      const dx = mx - bubbleDragStart.current.x;
      const dy = my - bubbleDragStart.current.y;
      const orig = bubbleOriginal.current;
      commitPointerUndo();
      setLayers((prev) =>
        prev.map((l) => ({
          ...l,
          bubbles: l.bubbles.map((bb) => {
            if (bb.id !== selectedBubbleId) return bb;
            const original = { ...bb, ...orig } as SpeechBubble;
            if (bubbleDragMode.current === "create") {
              const width = Math.abs(mx - bubbleDragStart.current.x);
              const height = Math.abs(my - bubbleDragStart.current.y);
              if (width < 8 && height < 8) return bb;
              const centerX = (mx + bubbleDragStart.current.x) / 2;
              const centerY = (my + bubbleDragStart.current.y) / 2;
              let nextWidth = Math.max(original.type === "line" || original.type === "arrow" ? 24 : 40, width);
              let nextHeight = Math.max(original.type === "line" || original.type === "arrow" ? 8 : 30, height);
              if (tool === "shape" && shapeType === "circle") {
                const diameter = Math.max(nextWidth, nextHeight);
                nextWidth = diameter;
                nextHeight = diameter;
              }
              return {
                ...bb,
                x: centerX,
                y: centerY,
                width: nextWidth,
                height: nextHeight,
                tailTipX: centerX,
                tailTipY: centerY + nextHeight / 2 + Math.max(20, nextHeight * 0.25),
              };
            }
            if (bubbleDragMode.current === "move") {
              return {
                ...bb,
                x: original.x + dx,
                y: original.y + dy,
                tailTipX: original.tailTipX + dx,
                tailTipY: original.tailTipY + dy,
              };
            }
            if (bubbleDragMode.current === "tail") {
              const tail = canvasPointToBubble(original, mx, my);
              return { ...bb, tailTipX: tail.x, tailTipY: tail.y };
            }
            if (bubbleDragMode.current === "rotate") {
              const startAngle = Math.atan2(bubbleDragStart.current.y - original.y, bubbleDragStart.current.x - original.x);
              const currentAngle = Math.atan2(my - original.y, mx - original.x);
              let rotation = (original.rotation ?? 0) + (currentAngle - startAngle) * 180 / Math.PI;
              rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
              if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
              return { ...bb, rotation };
            }
            if (bubbleDragMode.current === "resize") {
              const h = bubbleDragHandle.current;
              const localStart = canvasPointToBubble(original, bubbleDragStart.current.x, bubbleDragStart.current.y);
              const localCurrent = canvasPointToBubble(original, mx, my);
              const localDx = localCurrent.x - localStart.x;
              const localDy = localCurrent.y - localStart.y;
              let nw = original.width;
              let nh = original.height;
              let offsetX = 0;
              let offsetY = 0;
              if (h.includes("e")) { nw += localDx; offsetX += localDx / 2; }
              if (h.includes("w")) { nw -= localDx; offsetX += localDx / 2; }
              if (h.includes("s")) { nh += localDy; offsetY += localDy / 2; }
              if (h.includes("n")) { nh -= localDy; offsetY += localDy / 2; }
              const center = bubblePointToCanvas(original, original.x + offsetX, original.y + offsetY);
              return { ...bb, width: Math.max(40, nw), height: Math.max(30, nh), x: center.x, y: center.y };
            }
            return bb;
          }),
        }))
      );
      return;
    }

    if (tool === "move" && isDragging.current) {
      const dx = mx - dragStart.current.x;
      const dy = my - dragStart.current.y;
      commitPointerUndo();
      setLayers((prev) =>
        prev.map((layer) => {
          const start = dragLayerStarts.current.get(layer.id);
          return start ? translateLayer(start, dx, dy) : layer;
        })
      );
    } else if (tool === "crop" && cropping) {
      const x = Math.min(mx, cropStart.current.x);
      const y = Math.min(my, cropStart.current.y);
      const w = Math.abs(mx - cropStart.current.x);
      const h = Math.abs(my - cropStart.current.y);
      setCropRect({ x, y, w, h });
    }
  };

  const handleMouseUp = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (aiMaskDrawing.current) {
      aiMaskCanvasRef.current?.getContext("2d")?.restore();
      aiMaskDrawing.current = false;
      if (regionSelectionPurpose !== "ocr") setRedrawUseRegion(true);
      setMaskRevision((value) => value + 1);
    }
    if (eraserDrawingRef.current) {
      eraserDrawingRef.current = false;
      setMaskRevision((value) => value + 1);
    }
    if (drawing.current) {
      drawingLayerRef.current?.canvas.getContext("2d")?.restore();
      drawingLayerRef.current = null;
      drawing.current = false;
    }
    isDragging.current = false;
    layerTransformMode.current = "none";
    bubbleDragMode.current = "none";
    pointerChangeCommitted.current = false;
    if (tool === "crop" && cropping && cropRect && cropRect.w > 5 && cropRect.h > 5) {
      // AI 영역 지정 모드에서는 파괴적 크롭을 적용하지 않고 cropRect를 재생성 영역으로 보존한다.
      if (aiRegionMode) {
        const mask = document.createElement("canvas");
        mask.width = canvasW;
        mask.height = canvasH;
        const context = mask.getContext("2d")!;
        context.fillStyle = "#ffffff";
        context.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        aiMaskCanvasRef.current = mask;
        setAiRegionMode(false);
        if (regionSelectionPurpose === "ocr") {
          setOcrRegionMode("rectangle");
        } else {
          setRedrawUseRegion(true);
          setRedrawRegionMode("rectangle");
        }
        setTool("move");
        setCropRect(null);
        setMaskRevision((value) => value + 1);
      }
    }
    setCropping(false);
  };

  // 크롭 적용
  const applyCrop = () => {
    if (!cropRect) return;
    saveUndo(); // Undo 저장
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas || activeLayer.locked) return;

    const srcCtx = activeLayer.canvas.getContext("2d")!;
    const drawRect = layerDrawRect(activeLayer, canvasW, canvasH);
    const scaleX = activeLayer.canvas.width / drawRect.width;
    const scaleY = activeLayer.canvas.height / drawRect.height;

    // 크롭 사각형과 실제 이미지가 겹치는 영역(화면 좌표). 크롭이 이미지 밖으로
    // 벗어난 부분은 그리지 않고, 겹친 부분만 원래 위치·배율 그대로 옮긴다.
    const overlapLeft = Math.max(cropRect.x, drawRect.x);
    const overlapTop = Math.max(cropRect.y, drawRect.y);
    const overlapRight = Math.min(cropRect.x + cropRect.w, drawRect.x + drawRect.width);
    const overlapBottom = Math.min(cropRect.y + cropRect.h, drawRect.y + drawRect.height);
    if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
      setCropRect(null);
      return;
    }

    // 소스(레이어 캔버스) 픽셀 좌표로 변환하고 캔버스 경계로 클램프한다.
    const sourceX = Math.max(0, Math.floor((overlapLeft - drawRect.x) * scaleX));
    const sourceY = Math.max(0, Math.floor((overlapTop - drawRect.y) * scaleY));
    const sourceW = Math.min(
      activeLayer.canvas.width - sourceX,
      Math.max(1, Math.round((overlapRight - overlapLeft) * scaleX))
    );
    const sourceH = Math.min(
      activeLayer.canvas.height - sourceY,
      Math.max(1, Math.round((overlapBottom - overlapTop) * scaleY))
    );
    if (sourceW <= 0 || sourceH <= 0) {
      setCropRect(null);
      return;
    }
    const imageData = srcCtx.getImageData(sourceX, sourceY, sourceW, sourceH);

    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvasW;
    newCanvas.height = canvasH;
    const newCtx = newCanvas.getContext("2d")!;
    // 크롭 사각형은 새 캔버스 중앙에 배치되며, 겹친 영역은 그 안에서의 상대 위치
    // (overlap - cropRect)와 동일 배율을 유지해 오프셋/왜곡 없이 놓인다.
    const cx = (canvasW - cropRect.w) / 2;
    const cy = (canvasH - cropRect.h) / 2;
    const destX = cx + (overlapLeft - cropRect.x);
    const destY = cy + (overlapTop - cropRect.y);
    const destW = overlapRight - overlapLeft;
    const destH = overlapBottom - overlapTop;
    const cropped = document.createElement("canvas");
    cropped.width = sourceW;
    cropped.height = sourceH;
    cropped.getContext("2d")!.putImageData(imageData, 0, 0);
    newCtx.drawImage(cropped, destX, destY, destW, destH);

    setLayers((prev) =>
      prev.map((l) =>
        l.id === activeLayerId
          ? {
              ...l,
              canvas: newCanvas,
              scale: 1,
              rotation: 0,
              x: 0,
              y: 0,
              pixelDirty: true,
              pixelRevision: l.pixelRevision + 1,
            }
          : l
      )
    );
    setCropRect(null);
  };

  // 고화질 누끼는 서버 프록시를 통해 remove.bg에 전송한다. API 키는 브라우저에 노출하지 않는다.
  const handleRemoveBackground = async () => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas || activeLayer.locked) {
      setEditorMessage("누끼를 적용할 이미지 레이어를 먼저 선택해주세요.");
      return;
    }
    if (cutoutConfigured !== true) {
      setEditorMessage("누끼 API가 아직 연결되지 않았습니다. REMOVE_BG_API_KEY 설정이 필요합니다.");
      return;
    }

    setCutoutLoading(true);
    setEditorMessage(null);
    try {
      const sourceBlob = await canvasToBlob(activeLayer.canvas);
      const form = new FormData();
      form.append("image", sourceBlob, "canvas-layer.png");
      const response = await fetch("/api/studio/remove-background", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "이미지 배경을 제거하지 못했습니다.");
      }
      const resultBlob = await response.blob();
      const resultUrl = URL.createObjectURL(resultBlob);
      try {
        const resultImage = await loadImage(resultUrl);
        const nextCanvas = document.createElement("canvas");
        nextCanvas.width = activeLayer.canvas.width;
        nextCanvas.height = activeLayer.canvas.height;
        nextCanvas.getContext("2d")!.drawImage(resultImage, 0, 0, nextCanvas.width, nextCanvas.height);
        saveUndo();
        setLayers((current) => current.map((layer) => layer.id === activeLayerId
          ? {
              ...layer,
              image: resultImage,
              imageUrl: null,
              canvas: nextCanvas,
              pixelDirty: true,
              pixelRevision: layer.pixelRevision + 1,
            }
          : layer));
        setBackgroundRemoved(true);
        setEditorMessage(`누끼를 적용했습니다. ${AI_CREDIT_COSTS.cutout}크레딧을 사용했습니다.`);
      } finally {
        URL.revokeObjectURL(resultUrl);
      }
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "이미지 배경을 제거하지 못했습니다.");
    } finally {
      setCutoutLoading(false);
    }
  };

  // 투명도 조절
  const handleOpacityChange = (value: number) => {
    setDirty(true);
    setLayers((prev) =>
      prev.map((l) => (l.id === activeLayerId ? { ...l, opacity: value } : l))
    );
  };

  // 비율 변경: 현재 캔버스 크기 비례로 상하 패딩
  const handleAspectChange = (newAspect: AspectRatio) => {
    if (newAspect === aspect) return;
    saveUndo();

    const newW = canvasW;
    const newH = Math.round(canvasW * ASPECT_CONFIG[newAspect].heightRatio);

    const dy = (newH - canvasH) / 2; // 상하 확장/축소 오프셋

    setAspect(newAspect);
    setCanvasW(newW);
    setCanvasH(newH);

    setLayers((prev) =>
      prev.map((l) => {
        if (l.canvas) {
          const newCanvas = document.createElement("canvas");
          newCanvas.width = newW;
          newCanvas.height = newH;
          const ctx = newCanvas.getContext("2d")!;
          if (l.id === "layer_initial") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, newW, newH);
          }
          ctx.drawImage(l.canvas, 0, dy);
          return {
            ...l,
            canvas: newCanvas,
            pixelDirty: true,
            pixelRevision: l.pixelRevision + 1,
            width: newW,
            height: newH,
            bubbles: l.bubbles.map((bubble) => ({
              ...bubble,
              y: bubble.y + dy,
              tailTipY: bubble.tailTipY + dy,
            })),
          };
        }
        return {
          ...l,
          width: newW,
          height: newH,
          bubbles: l.bubbles.map((bubble) => ({
            ...bubble,
            y: bubble.y + dy,
            tailTipY: bubble.tailTipY + dy,
          })),
        };
      })
    );
  };

  // 말풍선 속성 변경
  const updateBubble = (id: string, updates: Partial<SpeechBubble>) => {
    setDirty(true);
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        bubbles: l.bubbles.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }))
    );
  };

  const applySelectedTextStyle = (updates: Partial<TextStyleRun>) => {
    if (!selectedBubble) return;
    const { start, end } = textSelectionRef.current;
    if (end > start) {
      updateBubble(selectedBubble.id, {
        textRuns: [...(selectedBubble.textRuns || []), { start, end, ...updates }].slice(-120),
      });
      return;
    }
    const wholeTextUpdates: Partial<SpeechBubble> = {};
    if (updates.fontWeight !== undefined) wholeTextUpdates.fontWeight = updates.fontWeight;
    if (updates.fontItalic !== undefined) wholeTextUpdates.fontItalic = updates.fontItalic;
    if (updates.underline !== undefined) wholeTextUpdates.underline = updates.underline;
    if (updates.baselineOffset !== undefined) wholeTextUpdates.baselineOffset = updates.baselineOffset;
    if (updates.textColor !== undefined) wholeTextUpdates.textColor = updates.textColor;
    updateBubble(selectedBubble.id, wholeTextUpdates);
  };

  // 말풍선 삭제
  const deleteBubble = useCallback((id: string) => {
    saveUndo();
    setLayers((prev) =>
      prev.map((l) => ({ ...l, bubbles: l.bubbles.filter((b) => b.id !== id) }))
    );
    setSelectedBubbleId(null);
  }, [saveUndo]);

  // 선택된 말풍선 가져오기
  const selectedBubble = selectedBubbleId
    ? layers.flatMap((l) => l.bubbles).find((b) => b.id === selectedBubbleId) ?? null
    : null;

  const selectedShapeBubble = selectedBubble
    && ["rectangle", "roundedRectangle", "ellipse", "line", "arrow", "star"].includes(selectedBubble.type)
    && !(selectedBubble.type === "roundedRectangle" && selectedBubble.tailEnabled)
    ? selectedBubble
    : null;
  const selectedTextBubble = selectedBubble?.type === "text" ? selectedBubble : null;
  const selectedSpeechBubble = selectedBubble && !selectedTextBubble && !selectedShapeBubble ? selectedBubble : null;
  const textToolValues: TextToolDefaults = selectedBubble?.type === "text"
    ? {
        fontSize: selectedBubble.fontSize ?? DEFAULT_TEXT_TOOL.fontSize,
        fontFamily: selectedBubble.fontFamily ?? DEFAULT_TEXT_TOOL.fontFamily,
        textColor: selectedBubble.textColor ?? DEFAULT_TEXT_TOOL.textColor,
        fontWeight: typeof selectedBubble.fontWeight === "number" && [300, 400, 700, 900].includes(selectedBubble.fontWeight)
          ? selectedBubble.fontWeight as TextToolDefaults["fontWeight"]
          : selectedBubble.fontWeight === "bold" ? 700 : 400,
        textAlign: selectedBubble.textAlign ?? DEFAULT_TEXT_TOOL.textAlign,
        fontItalic: Boolean(selectedBubble.fontItalic),
        underline: Boolean(selectedBubble.underline),
        outlineEnabled: Boolean(selectedBubble.outlineWidth),
        outlineColor: selectedBubble.outlineColor ?? DEFAULT_TEXT_TOOL.outlineColor,
        outlineWidth: selectedBubble.outlineWidth ?? DEFAULT_TEXT_TOOL.outlineWidth,
        lineHeightScale: selectedBubble.lineHeightScale ?? DEFAULT_TEXT_TOOL.lineHeightScale,
        letterSpacing: selectedBubble.letterSpacing ?? DEFAULT_TEXT_TOOL.letterSpacing,
      }
    : textToolDefaults;
  const shapeToolValues: ShapeToolDefaults = selectedShapeBubble
    ? {
        cornerRadius: selectedShapeBubble.cornerRadius ?? 0,
        strokeEnabled: selectedShapeBubble.strokeColor !== "transparent" && selectedShapeBubble.strokeWidth > 0,
        strokeColor: selectedShapeBubble.strokeColor === "transparent" ? shapeToolDefaults.strokeColor : selectedShapeBubble.strokeColor,
        strokeWidth: selectedShapeBubble.strokeWidth || shapeToolDefaults.strokeWidth,
        strokeStyle: selectedShapeBubble.strokeStyle ?? "solid",
        fillColor: selectedShapeBubble.fillColor === "transparent" ? shapeToolDefaults.fillColor : selectedShapeBubble.fillColor,
        fillOpacity: selectedShapeBubble.fillColor === "transparent" ? 0 : selectedShapeBubble.fillOpacity ?? 1,
        gradientEnabled: Boolean(selectedShapeBubble.gradientColor),
        gradientColor: selectedShapeBubble.gradientColor ?? shapeToolDefaults.gradientColor,
        gradientAngle: selectedShapeBubble.gradientAngle ?? 0,
        gradientStop: selectedShapeBubble.gradientStop ?? 50,
      }
    : shapeToolDefaults;

  const clearStagedEraser = useCallback(() => {
    eraserMaskCanvasRef.current = null;
    eraserLayerIdRef.current = null;
    eraserStrokesRef.current = [];
    eraserDrawingRef.current = false;
    setEraserPending(false);
    setMaskRevision((value) => value + 1);
  }, []);

  const activateTool = (nextTool: CanvasTool) => {
    if (nextTool !== "eraser") clearStagedEraser();
    setOcrOpen(false);
    setTool(nextTool);
    if (nextTool !== "crop") setCropRect(null);
    if (nextTool !== "text") setTextSizeMenuOpen(false);
  };

  const updateTextTool = (updates: Partial<TextToolDefaults>) => {
    if (selectedBubble?.type !== "text") {
      setTextToolDefaults((current) => ({ ...current, ...updates }));
      return;
    }
    const bubbleUpdates: Partial<SpeechBubble> = {};
    if (updates.fontSize !== undefined) bubbleUpdates.fontSize = updates.fontSize;
    if (updates.fontFamily !== undefined) bubbleUpdates.fontFamily = updates.fontFamily;
    if (updates.textColor !== undefined) bubbleUpdates.textColor = updates.textColor;
    if (updates.fontWeight !== undefined) bubbleUpdates.fontWeight = updates.fontWeight;
    if (updates.textAlign !== undefined) bubbleUpdates.textAlign = updates.textAlign;
    if (updates.fontItalic !== undefined) bubbleUpdates.fontItalic = updates.fontItalic;
    if (updates.underline !== undefined) bubbleUpdates.underline = updates.underline;
    if (updates.outlineColor !== undefined) bubbleUpdates.outlineColor = updates.outlineColor;
    if (updates.outlineWidth !== undefined) bubbleUpdates.outlineWidth = updates.outlineWidth;
    if (updates.outlineEnabled !== undefined) {
      bubbleUpdates.outlineWidth = updates.outlineEnabled ? Math.max(1, textToolValues.outlineWidth) : 0;
    }
    if (updates.lineHeightScale !== undefined) bubbleUpdates.lineHeightScale = updates.lineHeightScale;
    if (updates.letterSpacing !== undefined) bubbleUpdates.letterSpacing = updates.letterSpacing;
    updateBubble(selectedBubble.id, bubbleUpdates);
  };

  // 텍스트 서식(색/굵기/기울임/밑줄): 텍스트 객체가 선택돼 있으면 부분 문자열 서식을
  // 지원하는 applySelectedTextStyle(선택 범위 있으면 그 구간, 없으면 전체)을 쓰고,
  // 객체 선택 전이면 다음에 생성할 텍스트의 기본값(updateTextTool)을 갱신한다.
  const applyTextStyle = (run: Partial<TextStyleRun>, whole: Partial<TextToolDefaults>) => {
    if (selectedTextBubble) applySelectedTextStyle(run);
    else updateTextTool(whole);
  };

  const updateShapeTool = (updates: Partial<ShapeToolDefaults>) => {
    if (!selectedShapeBubble) {
      setShapeToolDefaults((current) => ({ ...current, ...updates }));
      return;
    }
    const bubbleUpdates: Partial<SpeechBubble> = {};
    if (updates.cornerRadius !== undefined) {
      bubbleUpdates.cornerRadius = updates.cornerRadius;
      if (selectedShapeBubble.type === "rectangle" || selectedShapeBubble.type === "roundedRectangle") {
        bubbleUpdates.type = updates.cornerRadius > 0 ? "roundedRectangle" : "rectangle";
      }
    }
    if (updates.strokeEnabled !== undefined) {
      bubbleUpdates.strokeColor = updates.strokeEnabled ? shapeToolValues.strokeColor : "transparent";
      bubbleUpdates.strokeWidth = updates.strokeEnabled ? Math.max(1, shapeToolValues.strokeWidth) : 0;
    }
    if (updates.strokeColor !== undefined) bubbleUpdates.strokeColor = updates.strokeColor;
    if (updates.strokeWidth !== undefined) bubbleUpdates.strokeWidth = updates.strokeWidth;
    if (updates.strokeStyle !== undefined) bubbleUpdates.strokeStyle = updates.strokeStyle;
    if (updates.fillColor !== undefined) bubbleUpdates.fillColor = updates.fillColor;
    if (updates.fillOpacity !== undefined) bubbleUpdates.fillOpacity = updates.fillOpacity;
    if (updates.gradientEnabled !== undefined) bubbleUpdates.gradientColor = updates.gradientEnabled ? shapeToolValues.gradientColor : undefined;
    if (updates.gradientColor !== undefined) bubbleUpdates.gradientColor = updates.gradientColor;
    if (updates.gradientAngle !== undefined) bubbleUpdates.gradientAngle = updates.gradientAngle;
    if (updates.gradientStop !== undefined) bubbleUpdates.gradientStop = updates.gradientStop;
    updateBubble(selectedShapeBubble.id, bubbleUpdates);
  };

  // 레이어 추가
  const addLayer = (position: "above" | "below") => {
    saveUndo();
    const idx = layers.findIndex((l) => l.id === activeLayerId);
    const newLayer = createLayer(undefined, canvasW, canvasH);
    const newLayers = [...layers];
    if (position === "above") {
      newLayers.splice(idx + 1, 0, newLayer);
    } else {
      newLayers.splice(idx, 0, newLayer);
    }
    setLayers(newLayers);
    setActiveLayerId(newLayer.id);
  };

  const addPanelLayout = (layout: "single" | "columns" | "rows" | "three" | "twoOne" | "four" | "threeColumns") => {
    saveUndo();
    const padding = Math.max(18, Math.round(Math.min(canvasW, canvasH) * 0.035));
    const gap = Math.max(16, Math.round(Math.min(canvasW, canvasH) * 0.025));
    const innerW = canvasW - padding * 2;
    const innerH = canvasH - padding * 2;
    const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];

    if (layout === "single") {
      rectangles.push({ x: canvasW / 2, y: canvasH / 2, width: innerW, height: innerH });
    } else if (layout === "columns") {
      const width = (innerW - gap) / 2;
      rectangles.push(
        { x: padding + width / 2, y: canvasH / 2, width, height: innerH },
        { x: padding + width + gap + width / 2, y: canvasH / 2, width, height: innerH }
      );
    } else if (layout === "rows") {
      const height = (innerH - gap) / 2;
      rectangles.push(
        { x: canvasW / 2, y: padding + height / 2, width: innerW, height },
        { x: canvasW / 2, y: padding + height + gap + height / 2, width: innerW, height }
      );
    } else if (layout === "three") {
      const height = (innerH - gap) / 2;
      const bottomWidth = (innerW - gap) / 2;
      rectangles.push(
        { x: canvasW / 2, y: padding + height / 2, width: innerW, height },
        { x: padding + bottomWidth / 2, y: padding + height + gap + height / 2, width: bottomWidth, height },
        { x: padding + bottomWidth + gap + bottomWidth / 2, y: padding + height + gap + height / 2, width: bottomWidth, height }
      );
    } else if (layout === "twoOne") {
      const height = (innerH - gap) / 2;
      const topWidth = (innerW - gap) / 2;
      rectangles.push(
        { x: padding + topWidth / 2, y: padding + height / 2, width: topWidth, height },
        { x: padding + topWidth + gap + topWidth / 2, y: padding + height / 2, width: topWidth, height },
        { x: canvasW / 2, y: padding + height + gap + height / 2, width: innerW, height }
      );
    } else if (layout === "four") {
      const width = (innerW - gap) / 2;
      const height = (innerH - gap) / 2;
      rectangles.push(
        { x: padding + width / 2, y: padding + height / 2, width, height },
        { x: padding + width + gap + width / 2, y: padding + height / 2, width, height },
        { x: padding + width / 2, y: padding + height + gap + height / 2, width, height },
        { x: padding + width + gap + width / 2, y: padding + height + gap + height / 2, width, height }
      );
    } else {
      const width = (innerW - gap * 2) / 3;
      rectangles.push(
        { x: padding + width / 2, y: canvasH / 2, width, height: innerH },
        { x: padding + width + gap + width / 2, y: canvasH / 2, width, height: innerH },
        { x: padding + (width + gap) * 2 + width / 2, y: canvasH / 2, width, height: innerH }
      );
    }

    const bubbles = rectangles.flatMap((rectangle, index) => {
      const outer = createBubble("rectangle", rectangle.x, rectangle.y);
      const inner = createBubble("rectangle", rectangle.x, rectangle.y);
      return [
        {
          ...outer,
          id: `panel_outer_${Date.now()}_${index}`,
          ...rectangle,
          fillColor: "transparent",
          strokeColor: "#ffffff",
          strokeWidth: Math.max(10, gap * 0.72),
        },
        {
          ...inner,
          id: `panel_inner_${Date.now()}_${index}`,
          ...rectangle,
          fillColor: "transparent",
          strokeColor: "#111111",
          strokeWidth: Math.max(2, Math.round(Math.min(canvasW, canvasH) / 180)),
        },
      ];
    });
    const newLayer = {
      ...createLayer(undefined, canvasW, canvasH),
      name: "패널 레이아웃",
      bubbles,
    };
    const activeIndex = layers.findIndex((layer) => layer.id === activeLayerId);
    const next = [...layers];
    next.splice(activeIndex >= 0 ? activeIndex + 1 : layers.length, 0, newLayer);
    setLayers(next);
    setActiveLayerId(newLayer.id);
    setSelectedBubbleId(null);
    setTool("move");
    setLayoutPickerOpen(false);
  };

  const duplicateLayer = useCallback(() => {
    const sourceIndex = layers.findIndex((layer) => layer.id === activeLayerId);
    if (sourceIndex < 0) return;
    saveUndo();
    const duplicate = cloneLayers([layers[sourceIndex]])[0];
    duplicate.id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    duplicate.name = `${duplicate.name || "레이어"} 복사본`.slice(0, 40);
    duplicate.groupId = null;
    duplicate.x += 12;
    duplicate.y += 12;
    duplicate.bubbles = duplicate.bubbles.map((bubble) => ({
      ...bubble,
      id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      x: bubble.x + 12,
      y: bubble.y + 12,
      tailTipX: bubble.tailTipX + 12,
      tailTipY: bubble.tailTipY + 12,
    }));
    const next = [...layers];
    next.splice(sourceIndex + 1, 0, duplicate);
    setLayers(next);
    setActiveLayerId(duplicate.id);
  }, [activeLayerId, layers, saveUndo]);

  const groupSelectedLayers = () => {
    const selected = selectedLayerIds.filter((id) => layers.some((layer) => layer.id === id));
    if (selected.length < 2) return;
    saveUndo();
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setLayers((current) => current.map((layer) =>
      selected.includes(layer.id) ? { ...layer, groupId } : layer
    ));
    setSelectedLayerIds([]);
  };

  const ungroupSelectedLayers = () => {
    const groupIds = new Set(
      layers
        .filter((layer) => selectedLayerIds.includes(layer.id) && layer.groupId)
        .map((layer) => layer.groupId as string)
    );
    if (groupIds.size === 0) return;
    saveUndo();
    setLayers((current) => current.map((layer) =>
      layer.groupId && groupIds.has(layer.groupId) ? { ...layer, groupId: null } : layer
    ));
    setSelectedLayerIds([]);
  };

  const alignSelection = (alignment: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => {
    if (selectedBubbleId) {
      const bubble = layers.flatMap((layer) => layer.bubbles).find((item) => item.id === selectedBubbleId);
      if (!bubble) return;
      saveUndo();
      const updates = alignment === "left"
        ? { x: bubble.width / 2 }
        : alignment === "centerX"
          ? { x: canvasW / 2 }
          : alignment === "right"
            ? { x: canvasW - bubble.width / 2 }
            : alignment === "top"
              ? { y: bubble.height / 2 }
              : alignment === "centerY"
                ? { y: canvasH / 2 }
                : { y: canvasH - bubble.height / 2 };
      updateBubble(selectedBubbleId, updates);
      return;
    }

    const ids = selectedLayerIds.length > 0 ? selectedLayerIds : activeLayerId ? [activeLayerId] : [];
    const selected = layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
    if (selected.length === 0) return;
    const bounds = new Map(selected.map((layer) => [layer.id, getLayerBounds(layer, canvasW, canvasH)]));
    const all = Array.from(bounds.values());
    const group = {
      left: Math.min(...all.map((item) => item.left)),
      right: Math.max(...all.map((item) => item.right)),
      top: Math.min(...all.map((item) => item.top)),
      bottom: Math.max(...all.map((item) => item.bottom)),
    };
    const target = alignment === "left"
      ? (selected.length === 1 ? 0 : group.left)
      : alignment === "centerX"
        ? (selected.length === 1 ? canvasW / 2 : (group.left + group.right) / 2)
        : alignment === "right"
          ? (selected.length === 1 ? canvasW : group.right)
          : alignment === "top"
            ? (selected.length === 1 ? 0 : group.top)
            : alignment === "centerY"
              ? (selected.length === 1 ? canvasH / 2 : (group.top + group.bottom) / 2)
              : (selected.length === 1 ? canvasH : group.bottom);
    saveUndo();
    setLayers((current) => current.map((layer) => {
      const box = bounds.get(layer.id);
      if (!box) return layer;
      const dx = alignment === "left"
        ? target - box.left
        : alignment === "centerX"
          ? target - box.centerX
          : alignment === "right"
            ? target - box.right
            : 0;
      const dy = alignment === "top"
        ? target - box.top
        : alignment === "centerY"
          ? target - box.centerY
          : alignment === "bottom"
            ? target - box.bottom
            : 0;
      return translateLayer(layer, dx, dy);
    }));
  };

  const distributeSelection = (axis: "horizontal" | "vertical") => {
    const selected = layers.filter((layer) => selectedLayerIds.includes(layer.id) && !layer.locked);
    if (selected.length < 3) return;
    const bounds = new Map(selected.map((layer) => [layer.id, getLayerBounds(layer, canvasW, canvasH)]));
    const sorted = [...selected].sort((leftLayer, rightLayer) => {
      const leftBounds = bounds.get(leftLayer.id)!;
      const rightBounds = bounds.get(rightLayer.id)!;
      return axis === "horizontal"
        ? leftBounds.centerX - rightBounds.centerX
        : leftBounds.centerY - rightBounds.centerY;
    });
    const first = bounds.get(sorted[0].id)!;
    const last = bounds.get(sorted[sorted.length - 1].id)!;
    const start = axis === "horizontal" ? first.centerX : first.centerY;
    const end = axis === "horizontal" ? last.centerX : last.centerY;
    const targets = new Map(sorted.map((layer, index) => [layer.id, start + (end - start) * index / (sorted.length - 1)]));
    saveUndo();
    setLayers((current) => current.map((layer) => {
      const box = bounds.get(layer.id);
      const target = targets.get(layer.id);
      if (!box || target === undefined) return layer;
      return axis === "horizontal"
        ? translateLayer(layer, target - box.centerX, 0)
        : translateLayer(layer, 0, target - box.centerY);
    }));
  };

  const addBubblePreset = (kind: "watermark" | "caption" | "sfx", sfxText = "쾅!") => {
    const bubble = kind === "watermark"
      ? {
          ...createBubble("text", canvasW - 125, canvasH - 38),
          presetKind: "watermark" as const,
          width: 220,
          height: 52,
          text: "워니바나나봇",
          textColor: "#ffffff",
          fontSize: 20,
          fontWeight: "bold" as const,
          opacity: 0.72,
        }
      : kind === "caption"
        ? {
            ...createBubble("rectangle", canvasW / 2, canvasH - 75),
            presetKind: "caption" as const,
            captionSlot: "bottom" as const,
            width: Math.max(260, canvasW - 70),
            height: 92,
            text: "내레이션을 입력하세요",
            fillColor: "#111111",
            strokeColor: "transparent",
            strokeWidth: 0,
            textColor: "#ffffff",
            fontSize: 24,
            opacity: 0.86,
          }
        : {
            ...createBubble("spiky", canvasW / 2, canvasH / 2),
            presetKind: "sfx" as const,
            width: 220,
            height: 150,
            text: sfxText,
            fillColor: "#fde047",
            textColor: "#111111",
            fontSize: 40,
            fontWeight: "bold" as const,
            fontFamily: "'Black Han Sans', Impact, sans-serif",
            outlineColor: "#ffffff",
            outlineWidth: 2,
          };
    const layer = {
      ...createLayer(undefined, canvasW, canvasH),
      name: kind === "watermark" ? "워터마크" : kind === "caption" ? "캡션·내레이션" : "효과음",
      bubbles: [bubble],
    };
    saveUndo();
    setLayers((current) => [...current, layer]);
    setActiveLayerId(layer.id);
    setSelectedBubbleId(bubble.id);
    setTool(bubble.type === "text" ? "text" : "bubble");
  };

  const upsertWatermarkLocally = (settings: WatermarkSettings) => {
    let selectedId = "";
    let targetLayerId = "";
    saveUndo();
    let found = false;
    const updated = layersRef.current.map((layer) => {
      const legacyLayer = layer.name === "워터마크";
      const bubbles = layer.bubbles.map((bubble) => {
        if (found || (bubble.presetKind !== "watermark" && !legacyLayer)) return bubble;
        found = true;
        selectedId = bubble.id;
        targetLayerId = layer.id;
        return { ...bubble, ...createWatermarkBubble(canvasW, canvasH, settings, bubble.id) } as SpeechBubble;
      });
      return { ...layer, bubbles };
    });
    if (!found) {
      const bubble = createWatermarkBubble(canvasW, canvasH, settings);
      const layer = {
        ...createLayer(undefined, canvasW, canvasH),
        name: "워터마크",
        bubbles: [bubble],
      };
      selectedId = bubble.id;
      targetLayerId = layer.id;
      updated.push(layer);
    }
    setLayers(updated);
    setActiveLayerId(targetLayerId);
    setSelectedBubbleId(selectedId);
    setTool("text");
    return updated;
  };

  const deleteWatermarkLocally = () => {
    const hasWatermark = layersRef.current.some((layer) =>
      layer.name === "워터마크" || layer.bubbles.some((bubble) => bubble.presetKind === "watermark")
    );
    if (!hasWatermark) return layersRef.current;
    saveUndo();
    const next = layersRef.current.flatMap((layer) => {
      const bubbles = layer.bubbles.filter((bubble) => bubble.presetKind !== "watermark");
      if (layer.name === "워터마크" && bubbles.length === 0 && !layer.canvas && !layer.fillColor && !layer.background && layersRef.current.length > 1) return [];
      return [{ ...layer, bubbles }];
    });
    const result = next.length > 0 ? next : layersRef.current;
    setLayers(result);
    setSelectedBubbleId(null);
    setTool("move");
    return result;
  };

  const applyCaptionSettingsLocally = (settings: CaptionSettings) => {
    let updatedCount = 0;
    // Use the rendered state directly here. A save can finish while the ref-sync
    // effect is still pending, which previously made a visible caption look absent.
    const next = layers.map((layer) => {
      const captionLayer = layer.name.includes("캡션") || layer.name.includes("내레이션");
      return {
        ...layer,
        bubbles: layer.bubbles.map((bubble) => {
          if (bubble.presetKind !== "caption" && !captionLayer) return bubble;
          const slot = bubble.captionSlot === "top" || bubble.captionSlot === "bottom"
            ? bubble.captionSlot
            : bubble.y < canvasH / 2 ? "top" : "bottom";
          updatedCount += 1;
          return {
            ...bubble,
            ...createCaptionBubble(canvasW, canvasH, slot, bubble.text || "", settings, bubble.id),
          } as SpeechBubble;
        }),
      };
    });
    if (updatedCount > 0) {
      saveUndo();
      layersRef.current = next;
      setLayers(next);
    }
    return { next, updatedCount };
  };

  const addCaptionLocally = (slot: "top" | "bottom") => {
    const bubble = createCaptionBubble(
      canvasW,
      canvasH,
      slot,
      slot === "top" ? "상단 캡션을 입력하세요" : "하단 캡션을 입력하세요",
      captionSettings
    );
    const layer = {
      ...createLayer(undefined, canvasW, canvasH),
      name: `캡션·내레이션 (${slot === "top" ? "상단" : "하단"})`,
      bubbles: [bubble],
    };
    saveUndo();
    setLayers((current) => [...current, layer]);
    setActiveLayerId(layer.id);
    setSelectedBubbleId(bubble.id);
    setTool("text");
    setCaptionOpen(false);
  };

  const applyPresetToOtherPages = async (body: Record<string, unknown>) => {
    if (!projectId || pages.length <= 1) return 0;
    const response = await fetch(`/api/studio/projects/${encodeURIComponent(projectId)}/canvas-presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, excludeCutId: cutId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "다른 컷에 설정을 적용하지 못했습니다.");
    await onCanvasBatchChange?.();
    return typeof data.updated === "number" ? data.updated : 0;
  };

  const applyWatermarkSettings = async () => {
    if (!watermarkSettings.text.trim()) return;
    setWatermarkApplying(true);
    setEditorMessage(null);
    try {
      const currentPageNumber = currentPageIndex >= 0 ? currentPageIndex + 1 : 1;
      const includesCurrent = watermarkScope !== "range"
        || (currentPageNumber >= watermarkRange.start && currentPageNumber <= watermarkRange.end);
      if (includesCurrent) {
        const next = upsertWatermarkLocally(watermarkSettings);
        await handleSave(next);
      }
      const updated = watermarkScope === "current"
        ? 0
        : await applyPresetToOtherPages({
            kind: "watermark",
            action: "apply",
            scope: watermarkScope,
            start: watermarkRange.start,
            end: watermarkRange.end,
            settings: watermarkSettings,
          });
      setWatermarkOpen(false);
      setEditorMessage(updated > 0 && includesCurrent
        ? `현재 컷과 다른 ${updated}개 컷에 워터마크를 적용했습니다.`
        : updated > 0
          ? `${updated}개 컷에 워터마크를 적용했습니다.`
          : includesCurrent
            ? "현재 컷에 워터마크를 적용했습니다."
            : "선택한 범위에 적용할 컷이 없습니다.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "워터마크를 적용하지 못했습니다.");
    } finally {
      setWatermarkApplying(false);
    }
  };

  const deleteWatermarks = async () => {
    setWatermarkApplying(true);
    setEditorMessage(null);
    try {
      const currentPageNumber = currentPageIndex >= 0 ? currentPageIndex + 1 : 1;
      const includesCurrent = watermarkScope !== "range"
        || (currentPageNumber >= watermarkRange.start && currentPageNumber <= watermarkRange.end);
      if (includesCurrent) {
        const next = deleteWatermarkLocally();
        await handleSave(next);
      }
      const updated = watermarkScope === "current"
        ? 0
        : await applyPresetToOtherPages({
            kind: "watermark",
            action: "delete",
            scope: watermarkScope,
            start: watermarkRange.start,
            end: watermarkRange.end,
          });
      setWatermarkOpen(false);
      setEditorMessage(updated > 0 && includesCurrent
        ? `현재 컷과 다른 ${updated}개 컷에서 워터마크를 삭제했습니다.`
        : updated > 0
          ? `${updated}개 컷에서 워터마크를 삭제했습니다.`
          : includesCurrent
            ? "현재 컷 워터마크를 삭제했습니다."
            : "선택한 범위에 적용할 컷이 없습니다.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "워터마크를 삭제하지 못했습니다.");
    } finally {
      setWatermarkApplying(false);
    }
  };

  const applyCaptionSettings = async () => {
    setCaptionApplying(true);
    setEditorMessage(null);
    try {
      const { next, updatedCount: currentUpdated } = applyCaptionSettingsLocally(captionSettings);
      if (currentUpdated > 0) await handleSave(next);
      const otherUpdated = await applyPresetToOtherPages({
        kind: "caption",
        action: "apply",
        scope: "all",
        settings: captionSettings,
      });
      setCaptionOpen(false);
      setEditorMessage(currentUpdated + otherUpdated > 0
        ? `현재 컷의 캡션 ${currentUpdated}개와 다른 ${otherUpdated}개 컷에 전역 서식을 적용했습니다.`
        : "적용할 캡션이 없습니다. 상단 또는 하단 캡션을 먼저 추가해주세요.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "캡션 서식을 적용하지 못했습니다.");
    } finally {
      setCaptionApplying(false);
    }
  };

  const addCustomBubble = () => {
    const bubble = {
      ...createBubble("roundedRectangle", canvasW / 2, canvasH / 2),
      width: Math.min(320, canvasW - 48),
      height: Math.min(190, canvasH - 48),
      text: "대사를 입력하세요",
      cornerRadius: 34,
      tailEnabled: true,
      tailTipX: canvasW / 2 - 80,
      tailTipY: canvasH / 2 + 150,
    };
    const currentLayer = layers.find((layer) => layer.id === activeLayerId && !layer.locked);
    saveUndo();
    if (currentLayer) {
      setLayers((current) => current.map((layer) => layer.id === currentLayer.id
        ? { ...layer, bubbles: [...layer.bubbles, bubble] }
        : layer));
    } else {
      const layer = { ...createLayer(undefined, canvasW, canvasH), name: "커스텀 말풍선", bubbles: [bubble] };
      setLayers((current) => [...current, layer]);
      setActiveLayerId(layer.id);
    }
    setSelectedBubbleId(bubble.id);
    setTool("bubble");
    setCustomBubbleOpen(true);
  };

  const BUBBLE_LIBRARY_KEY = "wony-canvas-bubble-library";
  const LEGACY_BUBBLE_KEY = "wony-canvas-custom-bubble";

  // 라이브러리 로드 + 구버전 단일 저장(write-only였던 키) 마이그레이션.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BUBBLE_LIBRARY_KEY);
      let list: SpeechBubble[] = raw ? (JSON.parse(raw) as SpeechBubble[]) : [];
      if (!Array.isArray(list)) list = [];
      const legacy = window.localStorage.getItem(LEGACY_BUBBLE_KEY);
      if (legacy) {
        try {
          const one = JSON.parse(legacy) as SpeechBubble;
          if (one && one.type) list = [one, ...list];
        } catch {}
        window.localStorage.removeItem(LEGACY_BUBBLE_KEY);
        window.localStorage.setItem(BUBBLE_LIBRARY_KEY, JSON.stringify(list.slice(0, 24)));
      }
      setBubbleLibrary(list.slice(0, 24));
    } catch {
      setBubbleLibrary([]);
    }
  }, []);

  const persistBubbleLibrary = (list: SpeechBubble[]) => {
    const capped = list.slice(0, 24);
    setBubbleLibrary(capped);
    try {
      window.localStorage.setItem(BUBBLE_LIBRARY_KEY, JSON.stringify(capped));
    } catch {}
  };

  // 현재 말풍선의 모양·스타일만 저장(위치·꼬리 절대좌표·본문 텍스트는 제외).
  const saveBubbleToLibrary = (bubble: SpeechBubble) => {
    const preset: SpeechBubble = {
      ...bubble,
      id: `bubblelib_${bubble.type}_${bubbleLibrary.length}_${bubble.width}x${bubble.height}`,
      x: 0,
      y: 0,
      tailTipX: 0,
      tailTipY: 0,
      text: "",
      textRuns: [],
    };
    persistBubbleLibrary([preset, ...bubbleLibrary]);
    setEditorMessage("말풍선 모양을 라이브러리에 저장했습니다. 아래 목록에서 다시 불러올 수 있어요.");
  };

  const removeBubbleFromLibrary = (index: number) => {
    persistBubbleLibrary(bubbleLibrary.filter((_, i) => i !== index));
  };

  // 라이브러리 모양을 캔버스 중앙에 새 말풍선으로 추가하고 편집 상태로 선택한다.
  const applyBubbleFromLibrary = (preset: SpeechBubble) => {
    const bubble: SpeechBubble = {
      ...preset,
      id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: canvasW / 2,
      y: canvasH / 2,
      tailTipX: canvasW / 2 - 80,
      tailTipY: canvasH / 2 + Math.max(120, preset.height / 2 + 60),
      text: "대사를 입력하세요",
      textRuns: [],
    };
    const currentLayer = layers.find((layer) => layer.id === activeLayerId && !layer.locked);
    saveUndo();
    if (currentLayer) {
      setLayers((current) => current.map((layer) => layer.id === currentLayer.id
        ? { ...layer, bubbles: [...layer.bubbles, bubble] }
        : layer));
    } else {
      const layer = { ...createLayer(undefined, canvasW, canvasH), name: "커스텀 말풍선", bubbles: [bubble] };
      setLayers((current) => [...current, layer]);
      setActiveLayerId(layer.id);
    }
    setSelectedBubbleId(bubble.id);
    setTool("bubble");
    setCustomBubbleOpen(true);
    setEditorMessage("라이브러리 말풍선을 캔버스에 추가했습니다.");
  };

  const downloadBubblePng = async (bubble: SpeechBubble) => {
    const padding = Math.max(24, bubble.strokeWidth * 6);
    const bodyCorners = [
      bubblePointToCanvas(bubble, bubble.x - bubble.width / 2, bubble.y - bubble.height / 2),
      bubblePointToCanvas(bubble, bubble.x + bubble.width / 2, bubble.y - bubble.height / 2),
      bubblePointToCanvas(bubble, bubble.x + bubble.width / 2, bubble.y + bubble.height / 2),
      bubblePointToCanvas(bubble, bubble.x - bubble.width / 2, bubble.y + bubble.height / 2),
    ];
    const tail = bubblePointToCanvas(bubble, bubble.tailTipX, bubble.tailTipY);
    const points = bubble.tailEnabled ? [...bodyCorners, tail] : bodyCorners;
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.ceil(right - left + padding * 2));
    output.height = Math.max(1, Math.ceil(bottom - top + padding * 2));
    drawBubble(output.getContext("2d")!, {
      ...bubble,
      x: bubble.x - left + padding,
      y: bubble.y - top + padding,
      tailTipX: bubble.tailTipX - left + padding,
      tailTipY: bubble.tailTipY - top + padding,
    });
    const blob = await canvasToBlob(output);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `speech-bubble-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updatePageBackground = (updates: Partial<PageBackground>, recordHistory = true) => {
    if (recordHistory) saveUndo();
    else setDirty(true);
    setLayers((current) => {
      const existing = current.find((layer) => layer.background || (layer.name === "페이지 배경" && !layer.canvas));
      const previous = existing?.background ?? {
        ...DEFAULT_PAGE_BACKGROUND,
        color: existing?.fillColor || DEFAULT_PAGE_BACKGROUND.color,
      };
      const background = { ...previous, ...updates };
      if (existing) {
        return current.map((layer) => layer.id === existing.id
          ? { ...layer, background, fillColor: null, visible: true, locked: true }
          : layer);
      }
      return [{
        ...createLayer(undefined, canvasW, canvasH),
        name: "페이지 배경",
        locked: true,
        background,
      }, ...current];
    });
  };

  // 레이어 삭제
  const deleteLayer = useCallback((id: string) => {
    if (layers.length <= 1) return;
    saveUndo();
    const newLayers = layers.filter((l) => l.id !== id);
    setLayers(newLayers);
    setSelectedLayerIds((current) => current.filter((item) => item !== id));
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[0].id);
    }
  }, [activeLayerId, layers, saveUndo]);

  // 레이어 순서 이동 (layers 배열에서 위=뒤, 아래=앞 — 렌더 순서상 앞이 아래)
  const moveLayer = (id: string, direction: "up" | "down" | "top" | "bottom") => {
    saveUndo();
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      if (direction === "top" || direction === "bottom") {
        const newLayers = [...prev];
        const [selected] = newLayers.splice(idx, 1);
        if (direction === "top") newLayers.push(selected);
        else newLayers.unshift(selected);
        return newLayers;
      }
      // "up" = 배열에서 뒤로 (렌더 순서상 위로)
      // "down" = 배열에서 앞으로 (렌더 순서상 아래로)
      const swapIdx = direction === "up" ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const newLayers = [...prev];
      [newLayers[idx], newLayers[swapIdx]] = [newLayers[swapIdx], newLayers[idx]];
      return newLayers;
    });
  };

  const reorderLayer = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = layersRef.current.findIndex((layer) => layer.id === sourceId);
    const targetIndex = layersRef.current.findIndex((layer) => layer.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    saveUndo();
    const next = [...layersRef.current];
    const [source] = next.splice(sourceIndex, 1);
    const targetIndexAfterRemoval = next.findIndex((layer) => layer.id === targetId);
    next.splice(targetIndexAfterRemoval + 1, 0, source);
    setLayers(next);
    setActiveLayerId(sourceId);
    setLayerDropTargetId(null);
  };

  const addImageLayer = async (imageUrl: string, name = "이미지 객체") => {
    const img = await loadImage(imageUrl);
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = canvasW;
    layerCanvas.height = canvasH;
    const ctx = layerCanvas.getContext("2d")!;
    const scale = Math.min(canvasW / img.width, canvasH / img.height);
    const width = img.width * scale;
    const height = img.height * scale;
    ctx.drawImage(img, (canvasW - width) / 2, (canvasH - height) / 2, width, height);
    const newLayer = {
      ...createLayer(undefined, canvasW, canvasH),
      name: name.slice(0, 40),
      image: img,
      imageUrl,
      canvas: layerCanvas,
      pixelDirty: true,
      pixelRevision: 1,
    };
    saveUndo();
    const activeIndex = layers.findIndex((layer) => layer.id === activeLayerId);
    const next = [...layers];
    next.splice(activeIndex >= 0 ? activeIndex + 1 : layers.length, 0, newLayer);
    setLayers(next);
    setActiveLayerId(newLayer.id);
    setSelectedBubbleId(null);
    setTool("move");
  };

  const handleImageFiles = async (files: File[]) => {
    const file = files.find((candidate) => candidate.type.startsWith("image/") && candidate.size <= 20 * 1024 * 1024);
    if (!file) {
      window.alert("20MB 이하 이미지 파일을 선택해주세요.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error());
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await addImageLayer(dataUrl, file.name.replace(/\.[^.]+$/, "") || "업로드 이미지");
  };

  const createCompositeCanvas = () => {
    const composite = document.createElement("canvas");
    composite.width = canvasW;
    composite.height = canvasH;
    const ctx = composite.getContext("2d")!;
    renderCanvasLayers(ctx, layers, canvasW, canvasH, canvasW, canvasH, true);
    return composite;
  };

  const createOcrSourceCanvas = () => {
    const source = createCompositeCanvas();
    if (ocrRegionMode === "all") return source;
    const mask = aiMaskCanvasRef.current;
    if (!mask) throw new Error("글자를 추출할 영역을 먼저 지정해주세요.");
    const maskContext = mask.getContext("2d")!;
    const pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data;
    let minX = mask.width;
    let minY = mask.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (pixels[(y * mask.width + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error("글자를 추출할 영역을 먼저 지정해주세요.");

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const selected = document.createElement("canvas");
    selected.width = width;
    selected.height = height;
    const selectedContext = selected.getContext("2d")!;
    selectedContext.drawImage(source, minX, minY, width, height, 0, 0, width, height);
    selectedContext.globalCompositeOperation = "destination-in";
    selectedContext.drawImage(mask, minX, minY, width, height, 0, 0, width, height);
    selectedContext.globalCompositeOperation = "source-over";

    const flattened = document.createElement("canvas");
    flattened.width = width;
    flattened.height = height;
    const flattenedContext = flattened.getContext("2d")!;
    flattenedContext.fillStyle = "#ffffff";
    flattenedContext.fillRect(0, 0, width, height);
    flattenedContext.drawImage(selected, 0, 0);
    return flattened;
  };

  const beginOcrRegionSelection = (mode: Exclude<OcrRegionMode, "all">) => {
    aiMaskCanvasRef.current = null;
    setMaskRevision((value) => value + 1);
    setCropRect(null);
    setOcrRegionMode(mode);
    setRegionSelectionPurpose("ocr");
    if (mode === "rectangle") {
      setAiRegionMode(true);
      setTool("crop");
    } else {
      setAiRegionMode(false);
      setTool("mask");
    }
  };

  const clearOcrRegion = () => {
    aiMaskCanvasRef.current = null;
    setMaskRevision((value) => value + 1);
    setCropRect(null);
    setAiRegionMode(false);
    setRegionSelectionPurpose(null);
    setTool("move");
  };

  const selectOcrRegionMode = (mode: OcrRegionMode) => {
    if (mode === "all") {
      clearOcrRegion();
      setOcrRegionMode("all");
      return;
    }
    beginOcrRegionSelection(mode);
  };

  const toggleOcrPanel = () => {
    if (ocrOpen) {
      clearOcrRegion();
      setOcrOpen(false);
      return;
    }
    setRedrawOpen(false);
    setOcrOpen(true);
    setOcrText("");
    selectOcrRegionMode("all");
  };

  const selectRedrawRegionMode = (mode: RedrawRegionMode) => {
    setRedrawRegionMode(mode);
    setRegionSelectionPurpose("redraw");
    if (mode === "all" || mode === "auto") {
      aiMaskCanvasRef.current = null;
      setMaskRevision((value) => value + 1);
      setTool("move");
      setAiRegionMode(false);
      setRedrawUseRegion(mode === "auto");
      return;
    }
    aiMaskCanvasRef.current = null;
    setMaskRevision((value) => value + 1);
    setRedrawUseRegion(true);
    if (mode === "rectangle") {
      setCropRect(null);
      setTool("crop");
      setAiRegionMode(true);
      return;
    }
    setTool("mask");
    setAiRegionMode(false);
  };

  const extractCanvasText = async () => {
    setOcrLoading(true);
    setEditorMessage(null);
    try {
      const image = createOcrSourceCanvas().toDataURL("image/jpeg", 0.9);
      const response = await fetch("/api/studio/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: { base64: image.split(",")[1], mimeType: "image/jpeg" } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "글자를 추출하지 못했습니다.");
      setOcrText(typeof data.text === "string" ? data.text : "");
      if (!data.text) setEditorMessage("이미지에서 읽을 수 있는 글자를 찾지 못했습니다.");
      setRegionSelectionPurpose(null);
      setTool("move");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "글자를 추출하지 못했습니다.");
    } finally {
      setOcrLoading(false);
    }
  };

  const addExtractedText = () => {
    if (!ocrText.trim()) return;
    const lines = ocrText.trim().split("\n").length;
    const bubble = {
      ...createBubble("text", canvasW / 2, canvasH / 2),
      width: Math.max(220, canvasW - 64),
      height: Math.min(canvasH - 48, Math.max(90, lines * 38 + 36)),
      text: ocrText.trim(),
      fontSize: 24,
    };
    const layer = {
      ...createLayer(undefined, canvasW, canvasH),
      name: "추출한 텍스트",
      bubbles: [bubble],
    };
    saveUndo();
    setLayers((current) => [...current, layer]);
    setActiveLayerId(layer.id);
    setSelectedBubbleId(bubble.id);
    setTool("text");
    setOcrOpen(false);
  };

  const queueAiRedraw = async (override?: {
    prompt?: string;
    regionMode?: RedrawRegionMode;
    mask?: HTMLCanvasElement | null;
  }) => {
    const requestedPrompt = override?.prompt ?? redrawPrompt;
    const requestedRegionMode = override?.regionMode ?? redrawRegionMode;
    if (!projectId || !cutId) {
      setEditorMessage("프로젝트 컷에서만 AI 다시 그리기를 사용할 수 있습니다.");
      return false;
    }
    if (!requestedPrompt.trim()) {
      setEditorMessage("다시 그릴 내용을 입력해주세요.");
      return false;
    }
    setRedrawLoading(true);
    setEditorMessage(null);
    try {
      const image = createCompositeCanvas().toDataURL("image/jpeg", 0.86);
      const generationAspect = aspect === "3:4" || aspect === "8:11" ? "4:5" : aspect;
      const manualMask = override?.mask !== undefined
        ? override.mask
        : redrawUseRegion && requestedRegionMode !== "auto" && requestedRegionMode !== "all"
          ? aiMaskCanvasRef.current
          : null;
      if ((requestedRegionMode === "rectangle" || requestedRegionMode === "freehand") && !manualMask) {
        throw new Error("수정할 영역을 먼저 지정해주세요.");
      }
      const editMask = manualMask?.toDataURL("image/png").split(",")[1];
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          presetIds: [],
          jobKind: "image",
          mode: "edit",
          aspectRatio: generationAspect,
          imageModel: redrawImageModel,
          imageSize: redrawImageSize,
          projectId,
          cutId,
          inputImage: { base64: image.split(",")[1], mimeType: "image/jpeg" },
          editRegionMode: requestedRegionMode === "rectangle" || requestedRegionMode === "freehand" ? "manual" : requestedRegionMode,
          preserveOutsideMask: requestedRegionMode !== "all",
          ...(editMask ? { editMask: { base64: editMask, mimeType: "image/png" } } : {}),
          prompt: [
            "현재 완성 컷을 참고해 같은 캐릭터 정체성, 그림체, 화면 비율을 유지하며 수정한다.",
            ...(requestedRegionMode === "auto"
              ? ["수정 요청과 직접 관련된 최소 영역만 찾아 수정한다."]
              : requestedRegionMode !== "all"
                ? ["첨부된 흰색 마스크 영역 안쪽만 수정한다. 마스크 밖 픽셀은 서버에서 원본으로 복원된다."]
                : []),
            `수정 요청: ${requestedPrompt.trim()}`,
            "요청하지 않은 인물, 글자, 로고, 워터마크를 추가하지 않는다.",
          ].join("\n"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI 다시 그리기를 시작하지 못했습니다.");
      const jobId = typeof data.job?.id === "string" ? data.job.id : null;
      if (!jobId) throw new Error("생성 작업 번호를 받지 못했습니다.");
      setRedrawJobId(jobId);
      setRedrawProgress(Number(data.job?.progress || 0));
      setRedrawOpen(false);
      setRedrawPrompt("");
      setEditorMessage("AI 다시 그리기를 시작했습니다. 이 화면에서 진행 상태와 결과를 자동으로 갱신합니다.");
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      return true;
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "AI 다시 그리기를 시작하지 못했습니다.");
      return false;
    } finally {
      setRedrawLoading(false);
    }
  };

  const applyTransparentEraser = () => {
    const layerId = eraserLayerIdRef.current;
    const strokes = eraserStrokesRef.current;
    const layer = layers.find((item) => item.id === layerId);
    if (!layer?.canvas || strokes.length === 0) {
      setEditorMessage("지울 영역을 먼저 칠해주세요.");
      return false;
    }

    saveUndo();
    const nextCanvas = cloneCanvas(layer.canvas);
    const context = nextCanvas.getContext("2d")!;
    const averageScale = Math.max(0.01, (Math.abs(layer.scaleX) + Math.abs(layer.scaleY)) / 2);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(1, brushSize / averageScale);
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      const points = stroke.map((point) => canvasPointToLayer(layer, canvasW, canvasH, point.x, point.y));
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      if (points.length === 1) {
        context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
      } else {
        for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    context.restore();
    alphaBoundsCache.delete(nextCanvas);
    setLayers((current) => current.map((item) => item.id === layer.id
      ? {
          ...item,
          canvas: nextCanvas,
          image: null,
          imageUrl: null,
          pixelDirty: true,
          pixelRevision: item.pixelRevision + 1,
        }
      : item));
    setDirty(true);
    clearStagedEraser();
    setEditorMessage("선택한 영역을 투명하게 지웠습니다.");
    return true;
  };

  const applyStagedEraser = async () => {
    if (!eraserPending) {
      setEditorMessage("지울 영역을 먼저 칠해주세요.");
      return;
    }
    if (eraserApplyMode === "transparent") {
      applyTransparentEraser();
      return;
    }
    const mask = eraserMaskCanvasRef.current;
    if (!mask) {
      setEditorMessage("지울 영역을 먼저 칠해주세요.");
      return;
    }
    const queued = await queueAiRedraw({
      prompt: "선택한 대상을 완전히 제거하고 주변 배경, 선, 색, 질감이 자연스럽게 이어지도록 복원한다. 새로운 인물, 글자, 로고를 추가하지 않는다.",
      regionMode: "freehand",
      mask,
    });
    if (queued) clearStagedEraser();
  };

  useEffect(() => {
    if (!redrawJobId) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(redrawJobId)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "AI 작업 상태를 불러오지 못했습니다.");
        if (canceled) return;
        const job = data.job as {
          status?: string;
          progress?: number;
          error?: string;
          artifacts?: Array<{ id: string; blobUrl: string; thumbnailUrl?: string | null; mimeType: string }>;
        };
        const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
        setRedrawProgress(progress);
        if (job.status === "succeeded") {
          const artifact = job.artifacts?.find((item) => item.mimeType.startsWith("image/"));
          if (!artifact) throw new Error("완료된 AI 이미지가 없습니다.");
          const image = await loadImage(artifact.blobUrl);
          if (canceled) return;
          const layerCanvas = document.createElement("canvas");
          layerCanvas.width = canvasW;
          layerCanvas.height = canvasH;
          layerCanvas.getContext("2d")!.drawImage(image, 0, 0, canvasW, canvasH);
          const layer = {
            ...createLayer(undefined, canvasW, canvasH),
            name: "AI 다시 그리기 결과",
            image,
            imageUrl: artifact.blobUrl,
            canvas: layerCanvas,
            pixelDirty: false,
            pixelRevision: 0,
          };
          setLayers([layer]);
          setActiveLayerId(layer.id);
          setSelectedBubbleId(null);
          setCropRect(null);
          aiMaskCanvasRef.current = null;
          setMaskRevision((value) => value + 1);
          setDirty(false);
          setSavedAt(new Date());
          setRedrawJobId(null);
          setEditorMessage("AI 다시 그리기가 완료되어 캔버스와 히스토리를 갱신했습니다.");
          onSave({
            id: artifact.id,
            dataUrl: artifact.blobUrl,
            thumbnailUrl: artifact.thumbnailUrl,
            mimeType: artifact.mimeType,
          });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("워니바나나봇", { body: "AI 다시 그리기가 완료되었습니다." });
          }
          return;
        }
        if (job.status === "failed" || job.status === "canceled") {
          setRedrawJobId(null);
          setEditorMessage(job.error || "AI 다시 그리기에 실패했습니다. 사용한 크레딧은 자동 환불됩니다.");
          return;
        }
        setEditorMessage(`AI 다시 그리기 진행 중 · ${progress}%`);
        timer = setTimeout(poll, 2_000);
      } catch (error) {
        if (canceled) return;
        setEditorMessage(error instanceof Error ? error.message : "AI 작업 상태를 불러오지 못했습니다.");
        timer = setTimeout(poll, 4_000);
      }
    };
    void poll();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canvasH, canvasW, onSave, redrawJobId]);

  // 갤러리 이미지를 레이어에 드롭
  const handleDropOnLayer = async (layerId: string, imageUrl: string) => {
    try {
      if (layers.find((layer) => layer.id === layerId)?.locked) return;
      saveUndo();
      const img = await loadImage(imageUrl);
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = canvasW;
      layerCanvas.height = canvasH;
      const ctx = layerCanvas.getContext("2d")!;
      const scale = Math.min(canvasW / img.width, canvasH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvasW - w) / 2;
      const y = (canvasH - h) / 2;
      ctx.drawImage(img, x, y, w, h);

      setLayers((prev) =>
        prev.map((l) =>
          l.id === layerId
            ? {
                ...l,
                image: img,
                imageUrl,
                canvas: layerCanvas,
                rotation: 0,
                x: 0,
                y: 0,
                pixelDirty: true,
                pixelRevision: l.pixelRevision + 1,
              }
            : l
        )
      );
    } catch {
      // ignore
    }
  };

  // 합치고 저장하기 (1080px)
  const handleSave = useCallback(async (layersOverride?: Layer[]) => {
    setSaving(true);
    try {
      const layersToSave = layersOverride ?? layers;
      const { exportW, exportH } = ASPECT_CONFIG[aspect];
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = exportW;
      exportCanvas.height = exportH;
      const ctx = exportCanvas.getContext("2d")!;
      renderCanvasLayers(ctx, layersToSave, canvasW, canvasH, exportW, exportH);

      const blob = await new Promise<Blob>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b!), "image/png")
      );
      const savedPixelRefs = new Map<string, { url: string; revision: number }>();
      let serializedCanvas: SerializedCanvasState | undefined;
      if (projectId && cutId) {
        const serializedLayers = await Promise.all(layersToSave.map(async (layer, index) => {
          const pixelUrl = layer.canvas
            ? !layer.pixelDirty && layer.imageUrl
              ? layer.imageUrl
              : await uploadViaTicket({
                  signEndpoint: "/api/images/upload",
                  file: await canvasToBlob(layer.canvas),
                  filename: `${cutId}-${index}-${Date.now()}.png`,
                  contentType: "image/png",
                  meta: { projectId, cutId, contentType: "image/png" },
                })
            : null;
          if (pixelUrl) {
            savedPixelRefs.set(layer.id, { url: pixelUrl, revision: layer.pixelRevision });
          }
          return {
            id: layer.id,
            name: layer.name,
            locked: layer.locked,
            groupId: layer.groupId,
            pixelUrl,
            opacity: layer.opacity,
            scale: layer.scale,
            scaleX: layer.scaleX,
            scaleY: layer.scaleY,
            rotation: layer.rotation,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            visible: layer.visible,
            fillColor: layer.fillColor,
            bubbles: layer.bubbles.map((bubble) => ({ ...bubble })),
            filter: layer.filter,
            filterIntensity: layer.filterIntensity,
            clipToBelow: layer.clipToBelow,
            background: layer.background ? { ...layer.background } : null,
          } satisfies SerializedCanvasLayer;
        }));
        serializedCanvas = {
          version: 2,
          aspect,
          width: canvasW,
          height: canvasH,
          layers: serializedLayers,
        };
      }
      const uploadedRef = await uploadViaTicket({
        signEndpoint: "/api/images/upload",
        file: blob,
        filename: `canvas-${Date.now()}.png`,
        contentType: "image/png",
        meta: { projectId, cutId, contentType: "image/png" },
      });

      const res = await fetch("/api/images/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: uploadedRef,
          mimeType: "image/png",
          ...(projectId ? { projectId } : {}),
          ...(cutId ? { cutId } : {}),
          ...(projectId ? { aspectRatio: aspect } : {}),
          ...(serializedCanvas ? { canvas: serializedCanvas } : {}),
          ...(backgroundRemoved ? { operation: "cutout" } : {}),
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "이미지를 저장하지 못했습니다.");
      setLayers((current) => current.map((layer) => {
        const savedPixel = savedPixelRefs.get(layer.id);
        if (!savedPixel || layer.pixelRevision !== savedPixel.revision) return layer;
        return { ...layer, imageUrl: savedPixel.url, pixelDirty: false };
      }));
      setDirty(false);
      setBackgroundRemoved(false);
      setSavedAt(new Date());
      setEditorMessage("캔버스와 편집 이력을 저장했습니다.");
      onSave(result as SavedCanvasImage);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "이미지를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }, [aspect, backgroundRemoved, canvasH, canvasW, cutId, layers, onSave, projectId]);

  const downloadCanvasPng = useCallback(async () => {
    const { exportW, exportH } = ASPECT_CONFIG[aspect];
    const output = document.createElement("canvas");
    output.width = exportW;
    output.height = exportH;
    renderCanvasLayers(output.getContext("2d")!, layers, canvasW, canvasH, exportW, exportH);
    const blob = await canvasToBlob(output);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `canvas-${aspect.replace(":", "x")}-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, [aspect, canvasH, canvasW, layers]);

  const downloadAllCanvasPages = useCallback(async () => {
    const exportPages = [...pages].sort((left, right) => left.order - right.order);
    if (exportPages.length === 0) {
      await onDownloadAllPages?.();
      return;
    }
    setExportingPages(true);
    setEditorMessage(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let rendered = 0;
      for (const [index, page] of exportPages.entries()) {
        const isCurrent = page.id === currentPageId;
        const serialized = isCurrent ? null : parseSerializedCanvas(page.canvas);
        let blob: Blob | null = null;
        if (isCurrent || (serialized && serialized.layers.length > 0)) {
          try {
            const pageLayers = isCurrent ? layers : await hydrateSerializedLayers(serialized!);
            const pageAspect = isCurrent ? aspect : serialized!.aspect;
            const pageWidth = isCurrent ? canvasW : serialized!.width;
            const pageHeight = isCurrent ? canvasH : serialized!.height;
            const outputSize = ASPECT_CONFIG[pageAspect];
            const output = document.createElement("canvas");
            output.width = outputSize.exportW;
            output.height = outputSize.exportH;
            renderCanvasLayers(output.getContext("2d")!, pageLayers, pageWidth, pageHeight, output.width, output.height);
            blob = await canvasToBlob(output);
          } catch {
            blob = null;
          }
        }
        if (!blob && page.imageUrl) {
          const response = await fetch(page.imageUrl);
          if (response.ok) blob = await response.blob();
        }
        if (!blob) continue;
        const safeTitle = page.title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60) || `page-${index + 1}`;
        zip.file(`${String(index + 1).padStart(2, "0")}-${safeTitle}.png`, blob);
        rendered += 1;
        setEditorMessage(`전체 PNG 준비 중 · ${index + 1}/${exportPages.length}`);
      }
      if (rendered === 0) throw new Error("내보낼 페이지가 없습니다.");
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `canvas-pages-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setEditorMessage(`${rendered}개 페이지를 최신 캔버스 상태로 내보냈습니다.`);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "전체 페이지를 내보내지 못했습니다.");
    } finally {
      setExportingPages(false);
    }
  }, [aspect, canvasH, canvasW, currentPageId, layers, onDownloadAllPages, pages]);

  const loadHistory = useCallback(async () => {
    if (!cutId) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/studio/cuts/${encodeURIComponent(cutId)}/versions`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "편집 히스토리를 불러오지 못했습니다.");
      setHistoryVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "편집 히스토리를 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }, [cutId]);

  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory]);

  const restoreVersion = async (version: CanvasVersionSummary) => {
    if (!cutId) return;
    setRestoringVersionId(version.id);
    try {
      const response = await fetch(
        `/api/studio/cuts/${encodeURIComponent(cutId)}/versions/${encodeURIComponent(version.id)}/restore`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "이 버전으로 복원하지 못했습니다.");
      const restoredState = parseSerializedCanvas((data as { cut?: { canvas?: unknown } }).cut?.canvas);
      if (restoredState?.layers.length) {
        const restoredLayers = await hydrateSerializedLayers(restoredState);
        setCanvasW(restoredState.width);
        setCanvasH(restoredState.height);
        setAspect(restoredState.aspect);
        setLayers(restoredLayers);
        setActiveLayerId(restoredLayers.at(-1)?.id || "");
        setEditorMessage("선택한 버전의 이미지와 세부 레이어를 모두 복원했습니다.");
      } else {
        const image = await loadImage(version.imageUrl);
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = canvasW;
        layerCanvas.height = canvasH;
        layerCanvas.getContext("2d")!.drawImage(image, 0, 0, canvasW, canvasH);
        const layer = {
          ...createLayer(undefined, canvasW, canvasH),
          name: "복원된 버전",
          image,
          imageUrl: version.imageUrl,
          canvas: layerCanvas,
          pixelDirty: false,
          pixelRevision: 0,
        };
        setLayers([layer]);
        setActiveLayerId(layer.id);
        setEditorMessage("선택한 이전 이미지를 복원했습니다.");
      }
      undoStack.current = [];
      redoStack.current = [];
      setSelectedLayerIds([]);
      setSelectedBubbleId(null);
      setBackgroundRemoved(false);
      setDirty(false);
      setSavedAt(new Date());
      await loadHistory();
      onSave({
        id: version.id,
        dataUrl: version.imageUrl,
        thumbnailUrl: version.thumbnailUrl,
        mimeType: "image/png",
      });
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "이 버전으로 복원하지 못했습니다.");
    } finally {
      setRestoringVersionId(null);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === "s") {
        event.preventDefault();
        if (!saving) void handleSave();
        return;
      }
      if (command && key === "c" && activeLayerId) {
        event.preventDefault();
        const layer = layersRef.current.find((item) => item.id === activeLayerId);
        copiedLayerRef.current = layer ? cloneLayers([layer])[0] : null;
        return;
      }
      if (command && key === "v" && copiedLayerRef.current) {
        event.preventDefault();
        saveUndo();
        const pasted = cloneLayers([copiedLayerRef.current])[0];
        pasted.id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        pasted.name = `${pasted.name} 복사본`.slice(0, 40);
        pasted.x += 12;
        pasted.y += 12;
        pasted.bubbles = pasted.bubbles.map((bubble) => ({
          ...bubble,
          id: `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          x: bubble.x + 12,
          y: bubble.y + 12,
          tailTipX: bubble.tailTipX + 12,
          tailTipY: bubble.tailTipY + 12,
        }));
        setLayers((current) => [...current, pasted]);
        setActiveLayerId(pasted.id);
        return;
      }
      if (command && key === "d" && activeLayerId) {
        event.preventDefault();
        duplicateLayer();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedBubbleId) {
          event.preventDefault();
          deleteBubble(selectedBubbleId);
        } else if (activeLayerId && layersRef.current.length > 1) {
          event.preventDefault();
          deleteLayer(activeLayerId);
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        if (!selectedBubbleId && !activeLayerId && (event.key === "ArrowLeft" || event.key === "ArrowRight") && onSelectPage) {
          const ordered = [...pages].sort((left, right) => left.order - right.order);
          const pageIndex = ordered.findIndex((page) => page.id === currentPageId);
          const targetIndex = event.key === "ArrowLeft" ? pageIndex - 1 : pageIndex + 1;
          const target = ordered[targetIndex];
          if (!target) return;
          event.preventDefault();
          if (dirty && !window.confirm("현재 페이지에 저장하지 않은 변경 사항이 있습니다. 저장하지 않고 이동할까요?")) return;
          void onSelectPage(target.id);
          return;
        }
        const amount = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        event.preventDefault();
        saveUndo();
        if (selectedBubbleId) {
          setLayers((current) => current.map((layer) => ({
            ...layer,
            bubbles: layer.bubbles.map((bubble) => bubble.id === selectedBubbleId ? {
              ...bubble,
              x: bubble.x + dx,
              y: bubble.y + dy,
              tailTipX: bubble.tailTipX + dx,
              tailTipY: bubble.tailTipY + dy,
            } : bubble),
          })));
        } else {
          setLayers((current) => current.map((layer) => layer.id === activeLayerId && !layer.locked
            ? translateLayer(layer, dx, dy)
            : layer));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeLayerId, currentPageId, deleteBubble, deleteLayer, dirty, duplicateLayer, handleSave, onSelectPage, pages, saveUndo, saving, selectedBubbleId]);

  const closeEditor = () => {
    if (dirty && !window.confirm("저장하지 않은 변경 사항이 있습니다. 편집을 종료할까요?")) return;
    onClose();
  };

  const runPageAction = (action?: () => void | Promise<void>) => {
    if (!action) return;
    if (dirty && !window.confirm("현재 페이지에 저장하지 않은 변경 사항이 있습니다. 저장하지 않고 페이지 작업을 계속할까요?")) return;
    void action();
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const displayScale = fitScale * zoom / 100;
  const pageBackgroundLayer = layers.find((layer) => layer.background || (layer.name === "페이지 배경" && !layer.canvas));
  const pageBackground: PageBackground = pageBackgroundLayer?.background ?? {
    ...DEFAULT_PAGE_BACKGROUND,
    color: pageBackgroundLayer?.fillColor || DEFAULT_PAGE_BACKGROUND.color,
  };
  const pageBackgroundColor = pageBackground.color;
  const displayedAssets = assetTab === "project"
    ? galleryImages
    : assetTab === "character"
      ? assetLibrary.character.filter((image) => characterView === "all" || image.view === characterView)
      : assetLibrary[assetTab];
  const orderedPages = [...pages].sort((a, b) => a.order - b.order);
  const currentPageIndex = orderedPages.findIndex((page) => page.id === currentPageId);
  const currentPage = currentPageIndex >= 0 ? orderedPages[currentPageIndex] : null;

  const renameCurrentPage = () => {
    if (!currentPage || !onRenamePage) return;
    setRenamingPageId(currentPage.id);
    setPageTitleDraft(currentPage.title);
  };

  const submitPageRename = () => {
    const title = pageTitleDraft.trim();
    const page = orderedPages.find((item) => item.id === renamingPageId);
    setRenamingPageId(null);
    if (!page || !onRenamePage || !title || title === page.title) return;
    void onRenamePage(page.id, title);
  };

  return (
    <div className={styles.overlay}>
      {/* 헤더 */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={closeEditor}>
          <LuArrowLeft size={18} /> 돌아가기
        </button>
        {editorMessage && (
          <div className={styles.editorNotice} role="status">
            <span>{editorMessage}</span>
            <button onClick={() => setEditorMessage(null)} title="알림 닫기"><LuX size={13} /></button>
          </div>
        )}
        <div className={styles.headerActions}>
          <span className={`${styles.saveStatus} ${dirty ? styles.saveStatusDirty : ""}`}>
            {saving
              ? "저장 중"
              : dirty
                ? "저장 안 됨"
                : savedAt
                  ? `${savedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 저장됨`
                  : "최신 상태"}
          </span>
          {cutId && (
            <button className={styles.headerIconButton} onClick={() => setHistoryOpen(true)} title="편집 히스토리">
              <LuHistory size={16} />
            </button>
          )}
          <button className={styles.headerIconButton} onClick={() => void downloadCanvasPng()} title="현재 캔버스 PNG 저장">
            <LuDownload size={16} />
          </button>
          <button className={styles.headerSaveButton} onClick={() => void handleSave()} disabled={saving || layers.length === 0}>
            {saving ? <LuLoaderCircle className={styles.spin} size={15} /> : <LuSave size={15} />} 저장
          </button>
          <button className={styles.headerDoneButton} onClick={closeEditor}>
            <LuCheck size={15} /> 완료
          </button>
          <span className={styles.title}><LuLayers size={16} /> 고급 캔버스</span>
        </div>
      </div>

      <div className={styles.body}>

        {orderedPages.length > 0 && (
          <aside className={`${styles.pagePanel} ${pagePanelCollapsed ? styles.pagePanelCollapsed : ""}`} aria-label="페이지 관리">
            <div className={styles.pagePanelHeader}>
              {!pagePanelCollapsed && <strong>페이지</strong>}
              <button
                onClick={() => setPagePanelCollapsed((value) => !value)}
                title={pagePanelCollapsed ? "페이지 패널 열기" : "페이지 패널 접기"}
              >
                {pagePanelCollapsed ? <LuPanelRightOpen size={14} /> : <LuPanelLeft size={14} />}
              </button>
            </div>
            {!pagePanelCollapsed && (
              <>
                <div className={styles.pageActions}>
                  <button onClick={() => runPageAction(onAddPage)} disabled={!onAddPage || orderedPages.length >= 30} title="새 페이지"><LuPlus size={13} /></button>
                  <button onClick={() => runPageAction(onDuplicatePage)} disabled={!onDuplicatePage || orderedPages.length >= 30} title="현재 페이지 복제"><LuCopy size={13} /></button>
                  <button onClick={renameCurrentPage} disabled={!currentPage || !onRenamePage} title="페이지 이름 변경"><LuPencil size={13} /></button>
                  <button
                    onClick={() => currentPage && void onSetCoverPage?.(currentPage.id)}
                    disabled={!currentPage || !onSetCoverPage}
                    className={currentPage?.id === coverPageId ? styles.pageActionActive : ""}
                    title="표지 지정"
                  ><LuStar size={13} /></button>
                  <button onClick={() => runPageAction(onMovePage ? () => onMovePage("up") : undefined)} disabled={!onMovePage || currentPageIndex <= 0} title="앞으로 이동"><LuChevronUp size={13} /></button>
                  <button onClick={() => runPageAction(onMovePage ? () => onMovePage("down") : undefined)} disabled={!onMovePage || currentPageIndex < 0 || currentPageIndex >= orderedPages.length - 1} title="뒤로 이동"><LuChevronDown size={13} /></button>
                  <button onClick={() => runPageAction(onDeletePage)} disabled={!onDeletePage || orderedPages.length <= 1} title="현재 페이지 삭제"><LuTrash2 size={13} /></button>
                </div>
                {renamingPageId === currentPage?.id && (
                  <form className={styles.pageRenameForm} onSubmit={(event) => { event.preventDefault(); submitPageRename(); }}>
                    <input
                      autoFocus
                      aria-label="페이지 이름"
                      maxLength={80}
                      value={pageTitleDraft}
                      onChange={(event) => setPageTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setRenamingPageId(null);
                      }}
                    />
                    <button type="submit" title="이름 저장" disabled={!pageTitleDraft.trim()}><LuCheck size={12} /></button>
                    <button type="button" title="이름 변경 취소" onClick={() => setRenamingPageId(null)}><LuX size={12} /></button>
                  </form>
                )}
                <div className={styles.pageList}>
                  {orderedPages.map((page) => (
                    <button
                      key={page.id}
                      className={page.id === currentPageId ? styles.pageItemActive : ""}
                      aria-current={page.id === currentPageId ? "page" : undefined}
                      onClick={() => {
                        if (page.id !== currentPageId) runPageAction(onSelectPage ? () => onSelectPage(page.id) : undefined);
                      }}
                    >
                      <span className={styles.pageThumb}>
                        {page.thumbnailUrl || page.imageUrl
                          ? <img src={page.thumbnailUrl || page.imageUrl || ""} alt="" />
                          : <span>빈 페이지</span>}
                      </span>
                      <span className={styles.pageMeta}>
                        <span className={styles.pageOrder}><b>{page.order + 1}</b>{page.id === coverPageId && <LuStar size={8} />}</span>
                        <small>{page.title}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className={styles.pageDownloads}>
                  <button onClick={() => void downloadCanvasPng()} disabled={layers.length === 0} title="현재 페이지 PNG"><LuDownload size={13} /> PNG</button>
                  <button onClick={() => void downloadAllCanvasPages()} disabled={exportingPages || orderedPages.length === 0} title="전체 페이지 ZIP">
                    {exportingPages ? <LuLoaderCircle className={styles.spin} size={13} /> : <LuDownload size={13} />} ZIP
                  </button>
                </div>
              </>
            )}
          </aside>
        )}

        <div className={styles.toolWorkspace}>
          <nav className={styles.toolRail} aria-label="캔버스 도구">
            {([
              ["move", "선택툴", LuMove],
              ["brush", "브러쉬", LuPencil],
              ["eraser", "지우개", LuEraser],
              ["text", "텍스트", LuType],
              ["bubble", "말풍선", LuMessageCircle],
              ["shape", "도형", LuShapes],
              ["pipette", "스포이트", LuPipette],
            ] as const).map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                className={!ocrOpen && tool === id ? styles.toolRailActive : ""}
                onClick={() => activateTool(id)}
                title={label}
                aria-label={label}
              >
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              className={ocrOpen ? styles.toolRailActive : ""}
              onClick={toggleOcrPanel}
              title="텍스트 추출"
              aria-label="텍스트 추출"
            >
              <LuScanText size={19} />
              <span>텍스트 추출</span>
            </button>
            <button
              type="button"
              className={styles.toolRailCollapse}
              onClick={() => setToolPanelCollapsed((value) => !value)}
              title={toolPanelCollapsed ? "옵션 패널 열기" : "옵션 패널 접기"}
              aria-label={toolPanelCollapsed ? "옵션 패널 열기" : "옵션 패널 접기"}
            >
              {toolPanelCollapsed ? <LuPanelRightOpen size={18} /> : <LuPanelLeft size={18} />}
            </button>
          </nav>

          {!toolPanelCollapsed && (
            <aside className={styles.toolOptionsPanel} aria-label="도구 옵션">
              <header className={styles.toolOptionsHeader}>
                <strong>{ocrOpen
                  ? "텍스트 추출"
                  : tool === "move" && selectedTextBubble ? "텍스트 옵션"
                    : tool === "move" && selectedSpeechBubble ? "말풍선 옵션"
                      : tool === "move" && selectedShapeBubble ? "도형 옵션"
                        : tool === "move" ? "선택 옵션"
                    : tool === "brush" ? "브러쉬 옵션"
                      : tool === "eraser" ? "지우개 옵션"
                        : tool === "text" ? "텍스트 옵션"
                          : tool === "bubble" ? "말풍선 옵션"
                            : tool === "shape" ? "도형 옵션"
                              : tool === "pipette" ? "스포이트 옵션"
                                : "옵션"}</strong>
                <button type="button" onClick={() => setToolPanelCollapsed(true)} title="옵션 패널 접기"><LuX size={15} /></button>
              </header>

              {ocrOpen ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <div className={styles.segmentedControl} aria-label="글자 추출 영역">
                      {([['all', '전체'], ['rectangle', '사각형'], ['freehand', '자유형식']] as const).map(([mode, label]) => (
                        <button type="button" key={mode} className={ocrRegionMode === mode ? styles.segmentActive : ""} onClick={() => selectOcrRegionMode(mode)}>{label}</button>
                      ))}
                    </div>
                    {ocrRegionMode !== "all" && (
                      <p className={styles.toolHint}>{aiMaskCanvasRef.current ? "영역 선택됨" : ocrRegionMode === "rectangle" ? "캔버스에서 사각형을 지정하세요." : "캔버스에 추출 영역을 칠하세요."}</p>
                    )}
                    <button className={styles.primaryOptionButton} onClick={() => void extractCanvasText()} disabled={ocrLoading || (ocrRegionMode !== "all" && !aiMaskCanvasRef.current)}>
                      {ocrLoading ? <LuLoaderCircle className={styles.spin} /> : <LuScanText />} 글자 추출 <CreditCostBadge credits={AI_CREDIT_COSTS.ocr} />
                    </button>
                  </section>
                  {ocrText && (
                    <section className={styles.optionSection}>
                      <label className={styles.optionLabel}>추출 결과</label>
                      <textarea rows={9} value={ocrText} onChange={(event) => setOcrText(event.target.value)} />
                      <button className={styles.primaryOptionButton} onClick={addExtractedText} disabled={!ocrText.trim()}><LuType /> 텍스트 객체로 추가</button>
                    </section>
                  )}
                </div>
              ) : tool === "brush" ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>브러쉬 종류</label>
                    <div className={styles.choiceGrid}>
                      {BRUSH_STYLES.map((style) => (
                        <button key={style.id} className={brushStyle === style.id ? styles.optionActive : ""} onClick={() => setBrushStyle(style.id)}>{style.label}</button>
                      ))}
                    </div>
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>색상</label>
                    <div className={styles.colorPalette}>
                      {BRUSH_COLORS.map((color) => <button key={color} className={brushColor.toLowerCase() === color.toLowerCase() ? styles.colorActive : ""} style={{ backgroundColor: color }} onClick={() => setBrushColor(color)} title={color} />)}
                    </div>
                    <div className={styles.colorFieldRow}>
                      <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
                      <span>#</span>
                      <input value={brushColor.slice(1).toUpperCase()} maxLength={6} aria-label="브러쉬 HEX 색상" onChange={(event) => {
                        const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                        if (value.length === 6) setBrushColor(`#${value}`);
                      }} />
                    </div>
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.rangeLabel}><span>두께</span><b>{brushSize}px</b></label>
                    <input type="range" min={2} max={60} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
                  </section>
                </div>
              ) : tool === "eraser" ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <p className={styles.toolHint}>지울 영역을 칠한 뒤 적용하세요.</p>
                    <div className={styles.segmentedControl}>
                      <button className={eraserApplyMode === "transparent" ? styles.segmentActive : ""} onClick={() => setEraserApplyMode("transparent")}>투명</button>
                      <button className={eraserApplyMode === "heal" ? styles.segmentActive : ""} onClick={() => setEraserApplyMode("heal")}>감쪽</button>
                    </div>
                    <label className={styles.rangeLabel}><span>두께</span><b>{brushSize}px</b></label>
                    <input type="range" min={4} max={120} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
                    <div className={styles.selectionStatus}>{eraserPending ? "지울 영역이 선택되었습니다." : "선택된 영역이 없습니다."}</div>
                    <button className={styles.primaryOptionButton} onClick={() => void applyStagedEraser()} disabled={!eraserPending || redrawLoading || Boolean(redrawJobId)}>
                      {redrawLoading ? <LuLoaderCircle className={styles.spin} /> : <LuEraser />} 지우기 적용
                      {eraserApplyMode === "heal" && <CreditCostBadge credits={getGenerationCreditCost("image", { imageModel: redrawImageModel, imageSize: redrawImageSize })} />}
                    </button>
                    <button className={styles.secondaryOptionButton} onClick={clearStagedEraser} disabled={!eraserPending}>선택 지우기</button>
                  </section>
                </div>
              ) : tool === "text" || (tool === "move" && Boolean(selectedTextBubble)) ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <button className={styles.primaryOptionButton} onClick={() => { setSelectedBubbleId(null); activateTool("text"); }}><LuPlus /> 텍스트 추가 (드래그)</button>
                    <p className={styles.toolHint}>캔버스에서 원하는 크기로 드래그하세요.</p>
                    {selectedTextBubble && <textarea rows={4} value={selectedTextBubble.text || ""} onSelect={(event) => { const start = event.currentTarget.selectionStart; const end = event.currentTarget.selectionEnd; textSelectionRef.current = { start, end }; setTextSelectionLen(Math.max(0, end - start)); }} onChange={(event) => { textSelectionRef.current = { start: 0, end: 0 }; setTextSelectionLen(0); updateBubble(selectedTextBubble.id, { text: event.target.value, textRuns: [] }); }} />}
                    {selectedTextBubble && <p className={styles.toolHint}>{textSelectionLen > 0 ? `선택한 ${textSelectionLen}자에 색·굵기·기울임·밑줄이 적용됩니다.` : "글자 일부를 드래그해 선택하면 그 부분만 서식을 바꿀 수 있어요. 선택하지 않으면 전체에 적용됩니다."}</p>}
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>글자 크기</label>
                    <div className={styles.numberWithMenu}>
                      <input type="number" min={8} max={240} value={textToolValues.fontSize} onChange={(event) => updateTextTool({ fontSize: Number(event.target.value) })} />
                      <button type="button" onClick={() => setTextSizeMenuOpen((value) => !value)} title="빠른 글자 크기"><LuChevronDown /></button>
                    </div>
                    {textSizeMenuOpen && <div className={styles.quickSizeGrid}>{TEXT_QUICK_SIZES.map((size) => <button key={size} className={textToolValues.fontSize === size ? styles.optionActive : ""} onClick={() => { updateTextTool({ fontSize: size }); setTextSizeMenuOpen(false); }}>{size}</button>)}</div>}
                    <label className={styles.optionLabel}>서체</label>
                    <select value={textToolValues.fontFamily} onChange={(event) => updateTextTool({ fontFamily: event.target.value })}>{BUBBLE_FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select>
                    <div className={styles.textPreview} style={{ fontFamily: textToolValues.fontFamily, fontSize: Math.min(28, textToolValues.fontSize) }}>가나다 ABC 123</div>
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>글자색</label>
                    <div className={styles.colorPalette}>{BRUSH_COLORS.map((color) => <button key={color} className={textToolValues.textColor.toLowerCase() === color.toLowerCase() ? styles.colorActive : ""} style={{ backgroundColor: color }} onClick={() => applyTextStyle({ textColor: color }, { textColor: color })} title={color} />)}</div>
                    <div className={styles.colorFieldRow}><input type="color" value={textToolValues.textColor} onChange={(event) => applyTextStyle({ textColor: event.target.value }, { textColor: event.target.value })} /><span>#</span><input value={textToolValues.textColor.slice(1).toUpperCase()} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) applyTextStyle({ textColor: `#${value}` }, { textColor: `#${value}` }); }} /></div>
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>외곽선</label>
                    <div className={styles.segmentedControl}><button className={!textToolValues.outlineEnabled ? styles.segmentActive : ""} onClick={() => updateTextTool({ outlineEnabled: false })}>OFF</button><button className={textToolValues.outlineEnabled ? styles.segmentActive : ""} onClick={() => updateTextTool({ outlineEnabled: true })}>ON</button></div>
                    {textToolValues.outlineEnabled && <><div className={styles.colorFieldRow}><input type="color" value={textToolValues.outlineColor} onChange={(event) => updateTextTool({ outlineColor: event.target.value })} /><span>#</span><input value={textToolValues.outlineColor.slice(1).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateTextTool({ outlineColor: `#${value}` }); }} /></div><label className={styles.rangeLabel}><span>두께</span><b>{textToolValues.outlineWidth}px</b></label><div className={styles.rangeControlRow}><input type="number" min={1} max={12} value={textToolValues.outlineWidth} onChange={(event) => updateTextTool({ outlineWidth: Number(event.target.value) })} /><input type="range" min={1} max={12} value={textToolValues.outlineWidth} onChange={(event) => updateTextTool({ outlineWidth: Number(event.target.value) })} /></div></>}
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>문자 서식</label>
                    <div className={styles.inlineButtonRow}>
                      {([300, 400, 700, 900] as const).map((weight) => <button key={weight} className={textToolValues.fontWeight === weight ? styles.optionActive : ""} onClick={() => applyTextStyle({ fontWeight: weight }, { fontWeight: weight })}>{weight}</button>)}
                    </div>
                    <div className={styles.inlineButtonRow}>
                      {([['left', '좌'], ['center', '중'], ['right', '우']] as const).map(([align, label]) => <button key={align} className={textToolValues.textAlign === align ? styles.optionActive : ""} onClick={() => updateTextTool({ textAlign: align })}>{label}</button>)}
                      <button className={textToolValues.fontItalic ? styles.optionActive : ""} onClick={() => applyTextStyle({ fontItalic: !textToolValues.fontItalic }, { fontItalic: !textToolValues.fontItalic })} title={textSelectionLen > 0 ? "선택 글자 기울임" : "기울임"}><i>I</i></button>
                      <button className={textToolValues.underline ? styles.optionActive : ""} onClick={() => applyTextStyle({ underline: !textToolValues.underline }, { underline: !textToolValues.underline })} title={textSelectionLen > 0 ? "선택 글자 밑줄" : "밑줄"}><u>U</u></button>
                      <button onClick={() => applySelectedTextStyle({ baselineOffset: -Math.max(2, textToolValues.fontSize * 0.18) })} disabled={!selectedTextBubble} title="기준선 위로">↑</button>
                      <button onClick={() => applySelectedTextStyle({ baselineOffset: Math.max(2, textToolValues.fontSize * 0.18) })} disabled={!selectedTextBubble} title="기준선 아래로">↓</button>
                    </div>
                    <label className={styles.rangeLabel}><span>행간</span><b>{textToolValues.lineHeightScale.toFixed(2)}</b></label><input type="range" min={1} max={2.5} step={0.01} value={textToolValues.lineHeightScale} onChange={(event) => updateTextTool({ lineHeightScale: Number(event.target.value) })} />
                    <label className={styles.rangeLabel}><span>자간</span><b>{textToolValues.letterSpacing}px</b></label><input type="range" min={-2} max={20} step={0.5} value={textToolValues.letterSpacing} onChange={(event) => updateTextTool({ letterSpacing: Number(event.target.value) })} />
                    {selectedTextBubble && <><label className={styles.rangeLabel}><span>투명도</span><b>{Math.round(selectedTextBubble.opacity * 100)}%</b></label><input type="range" min={0} max={100} value={Math.round(selectedTextBubble.opacity * 100)} onChange={(event) => updateBubble(selectedTextBubble.id, { opacity: Number(event.target.value) / 100 })} /><label className={styles.rangeLabel}><span>각도</span><b>{Math.round(selectedTextBubble.rotation || 0)}°</b></label><input type="range" min={-180} max={180} value={Math.round(selectedTextBubble.rotation || 0)} onChange={(event) => updateBubble(selectedTextBubble.id, { rotation: Number(event.target.value) })} /><button className={styles.secondaryOptionButton} onClick={() => updateBubble(selectedTextBubble.id, { textRuns: [], baselineOffset: 0 })}>선택 문자 서식 초기화</button><button className={styles.dangerOptionButton} onClick={() => deleteBubble(selectedTextBubble.id)}><LuTrash2 /> 텍스트 삭제</button></>}
                  </section>
                </div>
              ) : tool === "bubble" || (tool === "move" && Boolean(selectedSpeechBubble)) ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <button className={styles.primaryOptionButton} onClick={() => { setSelectedBubbleId(null); activateTool("bubble"); }}><LuPlus /> 말풍선 추가 (드래그)</button>
                    <p className={styles.toolHint}>캔버스에서 원하는 크기로 드래그하세요.</p>
                    <button className={styles.secondaryOptionButton} onClick={addCustomBubble}><LuSlidersHorizontal /> 말풍선 생성기 열기 (모양 커스텀)</button>
                    <div className={styles.bubblePresetRow}>
                      {([['classic', '💬'], ['thought', '💭'], ['spiky', '💥']] as const).map(([type, label]) => <button key={type} className={bubbleType === type ? styles.optionActive : ""} onClick={() => { setBubbleType(type); setSelectedBubbleId(null); }}>{label}</button>)}
                    </div>
                  </section>
                  {selectedSpeechBubble && (
                    <>
                      {customBubbleOpen && (
                        <section className={styles.optionSection}>
                          <label className={styles.optionLabel}>말풍선 생성기 미리보기</label>
                          <canvas
                            className={styles.customBubblePreview}
                            width={220}
                            height={140}
                            ref={(canvas) => {
                              if (!canvas) return;
                              const context = canvas.getContext("2d");
                              if (!context) return;
                              context.clearRect(0, 0, canvas.width, canvas.height);
                              const scale = Math.min(176 / Math.max(1, selectedSpeechBubble.width), 88 / Math.max(1, selectedSpeechBubble.height));
                              const previewX = 110;
                              const previewY = 58;
                              drawBubble(context, {
                                ...selectedSpeechBubble,
                                x: previewX,
                                y: previewY,
                                width: selectedSpeechBubble.width * scale,
                                height: selectedSpeechBubble.height * scale,
                                tailTipX: previewX + (selectedSpeechBubble.tailTipX - selectedSpeechBubble.x) * scale,
                                tailTipY: previewY + (selectedSpeechBubble.tailTipY - selectedSpeechBubble.y) * scale,
                                text: "",
                              });
                            }}
                          />
                        </section>
                      )}
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>대사</label>
                        <textarea rows={4} value={selectedSpeechBubble.text || ""} onChange={(event) => updateBubble(selectedSpeechBubble.id, { text: event.target.value, textRuns: [] })} />
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>말풍선 글자</label>
                        <select value={selectedSpeechBubble.fontFamily || BUBBLE_FONT_FAMILIES[0].id} onChange={(event) => updateBubble(selectedSpeechBubble.id, { fontFamily: event.target.value })}>{BUBBLE_FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select>
                        <div className={styles.twoColumnFields}><label>크기<input type="number" min={8} max={160} value={selectedSpeechBubble.fontSize || 24} onChange={(event) => updateBubble(selectedSpeechBubble.id, { fontSize: Number(event.target.value) })} /></label><label>외곽<input type="number" min={0} max={12} value={selectedSpeechBubble.outlineWidth || 0} onChange={(event) => updateBubble(selectedSpeechBubble.id, { outlineWidth: Number(event.target.value) })} /></label></div>
                        <div className={styles.colorFieldRow}><input type="color" value={selectedSpeechBubble.textColor || "#111111"} onChange={(event) => updateBubble(selectedSpeechBubble.id, { textColor: event.target.value })} /><span>#</span><input value={(selectedSpeechBubble.textColor || "#111111").slice(1).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateBubble(selectedSpeechBubble.id, { textColor: `#${value}` }); }} /></div>
                        <div className={styles.inlineButtonRow}>
                          {([300, 400, 700, 900] as const).map((weight) => <button key={weight} className={selectedSpeechBubble.fontWeight === weight ? styles.optionActive : ""} onClick={() => updateBubble(selectedSpeechBubble.id, { fontWeight: weight })}>{weight}</button>)}
                        </div>
                        <div className={styles.inlineButtonRow}>
                          {([['left', '좌'], ['center', '중'], ['right', '우']] as const).map(([align, label]) => <button key={align} className={(selectedSpeechBubble.textAlign || "center") === align ? styles.optionActive : ""} onClick={() => updateBubble(selectedSpeechBubble.id, { textAlign: align })}>{label}</button>)}
                          <button className={selectedSpeechBubble.fontItalic ? styles.optionActive : ""} onClick={() => updateBubble(selectedSpeechBubble.id, { fontItalic: !selectedSpeechBubble.fontItalic })}><i>I</i></button>
                          <button className={selectedSpeechBubble.underline ? styles.optionActive : ""} onClick={() => updateBubble(selectedSpeechBubble.id, { underline: !selectedSpeechBubble.underline })}><u>U</u></button>
                        </div>
                        <label className={styles.rangeLabel}><span>행간</span><b>{(selectedSpeechBubble.lineHeightScale || 1.28).toFixed(2)}</b></label><input type="range" min={1} max={2.5} step={0.01} value={selectedSpeechBubble.lineHeightScale || 1.28} onChange={(event) => updateBubble(selectedSpeechBubble.id, { lineHeightScale: Number(event.target.value) })} />
                        <label className={styles.rangeLabel}><span>자간</span><b>{selectedSpeechBubble.letterSpacing || 0}px</b></label><input type="range" min={-2} max={20} step={0.5} value={selectedSpeechBubble.letterSpacing || 0} onChange={(event) => updateBubble(selectedSpeechBubble.id, { letterSpacing: Number(event.target.value) })} />
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>모양</label>
                        <div className={styles.choiceGrid}>{([['classic', '타원'], ['roundedRectangle', '둥근 사각'], ['spiky', '뾰족'], ['cloud', '구름']] as const).map(([type, label]) => <button key={type} className={selectedSpeechBubble.type === type ? styles.optionActive : ""} onClick={() => updateBubble(selectedSpeechBubble.id, { type })}>{label}</button>)}</div>
                        <div className={styles.twoColumnFields}><label>W<input type="number" min={40} value={Math.round(selectedSpeechBubble.width)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { width: Number(event.target.value) })} /></label><label>H<input type="number" min={30} value={Math.round(selectedSpeechBubble.height)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { height: Number(event.target.value) })} /></label></div>
                        <label className={styles.rangeLabel}><span>모불모불</span><b>{Math.round((selectedSpeechBubble.roughness || 0) * 100)}</b></label><input type="range" min={0} max={100} value={Math.round((selectedSpeechBubble.roughness || 0) * 100)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { roughness: Number(event.target.value) / 100 })} />
                        <label className={styles.rangeLabel}><span>구불구불</span><b>{Math.round((selectedSpeechBubble.wobble || 0) * 100)}</b></label><input type="range" min={0} max={100} value={Math.round((selectedSpeechBubble.wobble || 0) * 100)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { wobble: Number(event.target.value) / 100 })} />
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>선</label>
                        <div className={styles.colorFieldRow}><input type="color" value={selectedSpeechBubble.strokeColor === "transparent" ? "#000000" : selectedSpeechBubble.strokeColor} onChange={(event) => updateBubble(selectedSpeechBubble.id, { strokeColor: event.target.value })} /><span>#</span><input value={(selectedSpeechBubble.strokeColor === "transparent" ? "000000" : selectedSpeechBubble.strokeColor.slice(1)).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateBubble(selectedSpeechBubble.id, { strokeColor: `#${value}` }); }} /></div>
                        <label className={styles.rangeLabel}><span>두께</span><b>{selectedSpeechBubble.strokeWidth}px</b></label><input type="range" min={0} max={16} value={selectedSpeechBubble.strokeWidth} onChange={(event) => updateBubble(selectedSpeechBubble.id, { strokeWidth: Number(event.target.value) })} />
                        <select value={selectedSpeechBubble.strokeStyle || "solid"} onChange={(event) => updateBubble(selectedSpeechBubble.id, { strokeStyle: event.target.value as SpeechBubble['strokeStyle'] })}><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option><option value="rough">손그림</option></select>
                        <label className={styles.rangeLabel}><span>선 투명도</span><b>{Math.round((selectedSpeechBubble.strokeOpacity ?? 1) * 100)}%</b></label><input type="range" min={0} max={100} value={Math.round((selectedSpeechBubble.strokeOpacity ?? 1) * 100)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { strokeOpacity: Number(event.target.value) / 100 })} />
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>채움</label>
                        <div className={styles.colorFieldRow}><input type="color" value={selectedSpeechBubble.fillColor === "transparent" ? "#ffffff" : selectedSpeechBubble.fillColor} onChange={(event) => updateBubble(selectedSpeechBubble.id, { fillColor: event.target.value })} /><span>#</span><input value={(selectedSpeechBubble.fillColor === "transparent" ? "FFFFFF" : selectedSpeechBubble.fillColor.slice(1)).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateBubble(selectedSpeechBubble.id, { fillColor: `#${value}` }); }} /></div>
                        <label className={styles.rangeLabel}><span>내부 투명도</span><b>{Math.round((selectedSpeechBubble.fillOpacity ?? 1) * 100)}%</b></label><input type="range" min={0} max={100} value={Math.round((selectedSpeechBubble.fillOpacity ?? 1) * 100)} onChange={(event) => updateBubble(selectedSpeechBubble.id, { fillOpacity: Number(event.target.value) / 100 })} />
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={selectedSpeechBubble.tailEnabled} onChange={(event) => updateBubble(selectedSpeechBubble.id, { tailEnabled: event.target.checked })} /> 꼬리</label>
                        {selectedSpeechBubble.tailEnabled && <><label className={styles.rangeLabel}><span>꼬리 폭</span><b>{selectedSpeechBubble.tailWidth}px</b></label><input type="range" min={8} max={96} value={selectedSpeechBubble.tailWidth} onChange={(event) => updateBubble(selectedSpeechBubble.id, { tailWidth: Number(event.target.value) })} /></>}
                        {customBubbleOpen ? (
                          <>
                            <div className={styles.customGeneratorActions}>
                              <button onClick={() => saveBubbleToLibrary(selectedSpeechBubble)}><LuSave /> 라이브러리 저장</button>
                              <button onClick={() => void downloadBubblePng(selectedSpeechBubble)}><LuDownload /> PNG</button>
                              <button onClick={() => { setCustomBubbleOpen(false); setEditorMessage("커스텀 말풍선을 캔버스에 추가했습니다."); }}><LuPlus /> 추가</button>
                              <button onClick={() => { setCustomBubbleOpen(false); deleteBubble(selectedSpeechBubble.id); }}><LuX /> 닫기</button>
                            </div>
                            {bubbleLibrary.length > 0 && (
                              <div className={styles.bubbleLibrary}>
                                <label className={styles.optionLabel}>내 말풍선 라이브러리 ({bubbleLibrary.length})</label>
                                <div className={styles.bubbleLibraryGrid}>
                                  {bubbleLibrary.map((preset, index) => (
                                    <div key={preset.id} className={styles.bubbleLibraryItem}>
                                      <button
                                        type="button"
                                        className={styles.bubbleLibraryApply}
                                        title={`${preset.type} · ${Math.round(preset.width)}×${Math.round(preset.height)} 불러오기`}
                                        onClick={() => applyBubbleFromLibrary(preset)}
                                      >
                                        <span style={{
                                          display: "block",
                                          width: 40,
                                          height: 28,
                                          borderRadius: preset.type === "roundedRectangle" ? 8 : preset.type === "classic" || preset.type === "ellipse" ? "50%" : 3,
                                          border: `2px solid ${preset.strokeColor === "transparent" ? "#8b95a1" : preset.strokeColor}`,
                                          background: preset.fillColor === "transparent" ? "transparent" : preset.fillColor,
                                        }} />
                                      </button>
                                      <button type="button" className={styles.bubbleLibraryRemove} title="삭제" onClick={() => removeBubbleFromLibrary(index)}><LuX size={12} /></button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : <button className={styles.secondaryOptionButton} onClick={() => void downloadBubblePng(selectedSpeechBubble)}><LuDownload /> 투명 PNG로 저장</button>}
                        <button className={styles.dangerOptionButton} onClick={() => deleteBubble(selectedSpeechBubble.id)}><LuTrash2 /> 말풍선 삭제</button>
                      </section>
                    </>
                  )}
                </div>
              ) : tool === "shape" || (tool === "move" && Boolean(selectedShapeBubble)) ? (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <button className={styles.primaryOptionButton} onClick={() => { setSelectedBubbleId(null); activateTool("shape"); }}><LuPlus /> 도형 추가 (드래그)</button>
                    <p className={styles.toolHint}>캔버스에서 원하는 크기로 드래그하세요.</p>
                    <div className={styles.shapeChoiceGrid}>
                      {([['rectangle', '사각형', LuSquare], ['circle', '원', LuCircle], ['ellipse', '타원', LuCircle], ['line', '선', LuMinus], ['arrow', '화살표', LuArrowRight]] as const).map(([type, label, Icon]) => <button key={type} className={shapeType === type ? styles.optionActive : ""} onClick={() => { setShapeType(type); setSelectedBubbleId(null); }} title={label}><Icon /><span>{label}</span></button>)}
                    </div>
                  </section>
                  {(shapeType === "rectangle" || selectedShapeBubble?.type === "rectangle" || selectedShapeBubble?.type === "roundedRectangle") && <section className={styles.optionSection}><label className={styles.rangeLabel}><span>모서리 둥글기</span><b>{shapeToolValues.cornerRadius}px</b></label><div className={styles.rangeControlRow}><input type="number" min={0} max={100} value={shapeToolValues.cornerRadius} onChange={(event) => updateShapeTool({ cornerRadius: Number(event.target.value) })} /><input type="range" min={0} max={100} value={shapeToolValues.cornerRadius} onChange={(event) => updateShapeTool({ cornerRadius: Number(event.target.value) })} /></div></section>}
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>테두리</label>
                    <div className={styles.segmentedControl}><button className={!shapeToolValues.strokeEnabled ? styles.segmentActive : ""} onClick={() => updateShapeTool({ strokeEnabled: false })}>없음</button><button className={shapeToolValues.strokeEnabled ? styles.segmentActive : ""} onClick={() => updateShapeTool({ strokeEnabled: true })}>색상</button></div>
                    {shapeToolValues.strokeEnabled && <><div className={styles.colorFieldRow}><input type="color" value={shapeToolValues.strokeColor} onChange={(event) => updateShapeTool({ strokeColor: event.target.value })} /><span>#</span><input value={shapeToolValues.strokeColor.slice(1).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateShapeTool({ strokeColor: `#${value}` }); }} /></div><label className={styles.rangeLabel}><span>두께</span><b>{shapeToolValues.strokeWidth}px</b></label><div className={styles.rangeControlRow}><input type="number" min={1} max={24} value={shapeToolValues.strokeWidth} onChange={(event) => updateShapeTool({ strokeWidth: Number(event.target.value) })} /><input type="range" min={1} max={24} value={shapeToolValues.strokeWidth} onChange={(event) => updateShapeTool({ strokeWidth: Number(event.target.value) })} /></div><select value={shapeToolValues.strokeStyle} onChange={(event) => updateShapeTool({ strokeStyle: event.target.value as ShapeToolDefaults['strokeStyle'] })}><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option><option value="rough">손그림</option></select></>}
                  </section>
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>채움</label>
                    <div className={styles.colorFieldRow}><input type="color" value={shapeToolValues.fillColor} onChange={(event) => updateShapeTool({ fillColor: event.target.value })} /><span>#</span><input value={shapeToolValues.fillColor.slice(1).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateShapeTool({ fillColor: `#${value}` }); }} /></div>
                    <label className={styles.rangeLabel}><span>투명도</span><b>{Math.round(shapeToolValues.fillOpacity * 100)}%</b></label><div className={styles.rangeControlRow}><input type="number" min={0} max={100} value={Math.round(shapeToolValues.fillOpacity * 100)} onChange={(event) => updateShapeTool({ fillOpacity: Number(event.target.value) / 100 })} /><input type="range" min={0} max={100} value={Math.round(shapeToolValues.fillOpacity * 100)} onChange={(event) => updateShapeTool({ fillOpacity: Number(event.target.value) / 100 })} /></div>
                    <label className={styles.checkboxLabel}><input type="checkbox" checked={shapeToolValues.gradientEnabled} onChange={(event) => updateShapeTool({ gradientEnabled: event.target.checked })} /> 그라데이션</label>
                    {shapeToolValues.gradientEnabled && <><label className={styles.optionLabel}>끝 색</label><div className={styles.colorFieldRow}><input type="color" value={shapeToolValues.gradientColor} onChange={(event) => updateShapeTool({ gradientColor: event.target.value })} /><span>#</span><input value={shapeToolValues.gradientColor.slice(1).toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) updateShapeTool({ gradientColor: `#${value}` }); }} /></div><label className={styles.rangeLabel}><span>각도</span><b>{shapeToolValues.gradientAngle}°</b></label><div className={styles.rangeControlRow}><input type="number" min={0} max={360} value={shapeToolValues.gradientAngle} onChange={(event) => updateShapeTool({ gradientAngle: Number(event.target.value) })} /><input type="range" min={0} max={360} value={shapeToolValues.gradientAngle} onChange={(event) => updateShapeTool({ gradientAngle: Number(event.target.value) })} /></div><label className={styles.rangeLabel}><span>비율</span><b>{shapeToolValues.gradientStop}%</b></label><div className={styles.rangeControlRow}><input type="number" min={5} max={95} value={shapeToolValues.gradientStop} onChange={(event) => updateShapeTool({ gradientStop: Number(event.target.value) })} /><input type="range" min={5} max={95} value={shapeToolValues.gradientStop} onChange={(event) => updateShapeTool({ gradientStop: Number(event.target.value) })} /></div></>}
                    {selectedShapeBubble && <><label className={styles.rangeLabel}><span>전체 투명도</span><b>{Math.round(selectedShapeBubble.opacity * 100)}%</b></label><input type="range" min={0} max={100} value={Math.round(selectedShapeBubble.opacity * 100)} onChange={(event) => updateBubble(selectedShapeBubble.id, { opacity: Number(event.target.value) / 100 })} /><label className={styles.rangeLabel}><span>회전</span><b>{Math.round(selectedShapeBubble.rotation || 0)}°</b></label><input type="range" min={-180} max={180} value={Math.round(selectedShapeBubble.rotation || 0)} onChange={(event) => updateBubble(selectedShapeBubble.id, { rotation: Number(event.target.value) })} /><button className={styles.dangerOptionButton} onClick={() => deleteBubble(selectedShapeBubble.id)}><LuTrash2 /> 도형 삭제</button></>}
                  </section>
                </div>
              ) : tool === "pipette" ? (
                <div className={styles.optionStack}><section className={styles.optionSection}><p className={styles.toolHint}>캔버스의 색을 클릭하면 브러쉬 색으로 가져옵니다.</p><div className={styles.sampledColor}><span style={{ backgroundColor: brushColor }} /><b>{brushColor.toUpperCase()}</b></div></section></div>
              ) : (
                <div className={styles.optionStack}>
                  <section className={styles.optionSection}>
                    <label className={styles.rangeLabel}><span>투명도</span><b>{Math.round((activeLayer?.opacity ?? 1) * 100)}%</b></label>
                    <input type="range" min={0} max={100} value={Math.round((activeLayer?.opacity ?? 1) * 100)} onChange={(event) => handleOpacityChange(Number(event.target.value) / 100)} disabled={!activeLayer} />
                  </section>
                  {activeLayer?.canvas && (
                    <>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>위치와 크기</label>
                        <div className={styles.objectFieldGrid}>
                          {([['X', Math.round(activeLayer.x), (value: number) => ({ x: value })], ['Y', Math.round(activeLayer.y), (value: number) => ({ y: value })], ['W', Math.round(canvasW * activeLayer.scaleX), (value: number) => ({ scaleX: Math.max(0.05, value / canvasW) })], ['H', Math.round(canvasH * activeLayer.scaleY), (value: number) => ({ scaleY: Math.max(0.05, value / canvasH) })], ['각도', Math.round(activeLayer.rotation), (value: number) => ({ rotation: Math.max(-180, Math.min(180, value)) })]] as const).map(([label, value, createUpdate]) => <label key={label}><span>{label}</span><input type="number" value={value} onFocus={saveUndo} onChange={(event) => { setDirty(true); setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, ...createUpdate(Number(event.target.value) || 0) } : layer)); }} disabled={activeLayer.locked} /></label>)}
                        </div>
                        <div className={styles.inlineButtonRow}><button onClick={() => flipActiveLayer("h")} disabled={activeLayer.locked} title="좌우 뒤집기"><LuFlipHorizontal2 /> 좌우</button><button onClick={() => flipActiveLayer("v")} disabled={activeLayer.locked} title="상하 뒤집기"><LuFlipVertical2 /> 상하</button></div>
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>레이어 순서</label>
                        <div className={styles.inlineButtonRow}><button onClick={() => moveLayer(activeLayer.id, "top")} title="맨 앞으로"><LuArrowUpToLine /></button><button onClick={() => moveLayer(activeLayer.id, "up")} title="앞으로"><LuChevronUp /></button><button onClick={() => moveLayer(activeLayer.id, "down")} title="뒤로"><LuChevronDown /></button><button onClick={() => moveLayer(activeLayer.id, "bottom")} title="맨 뒤로"><LuArrowDownToLine /></button></div>
                      </section>
                      <section className={styles.optionSection}>
                        <label className={styles.optionLabel}>필터</label>
                        <div className={styles.filterGrid}>{IMAGE_FILTERS.map((filter) => <button key={filter.id} className={activeLayer.filter === filter.id ? styles.optionActive : ""} onClick={() => { saveUndo(); setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, filter: filter.id } : layer)); }}>{filter.label}</button>)}</div>
                        {activeLayer.filter !== "original" && <><label className={styles.rangeLabel}><span>강도</span><b>{Math.round(activeLayer.filterIntensity * 100)}%</b></label><input type="range" min={0} max={100} value={Math.round(activeLayer.filterIntensity * 100)} onPointerDown={saveUndo} onChange={(event) => setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, filterIntensity: Number(event.target.value) / 100 } : layer))} /></>}
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={activeLayer.clipToBelow} disabled={activeLayer.locked || layers[0]?.id === activeLayer.id} onChange={(event) => { saveUndo(); setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, clipToBelow: event.target.checked } : layer)); }} /> 아래 레이어에 클리핑</label>
                      </section>
                    </>
                  )}
                  <section className={styles.optionSection}>
                    <label className={styles.optionLabel}>정렬과 분배</label>
                    <div className={styles.iconButtonGrid}><button onClick={() => alignSelection("left")} title="왼쪽"><LuAlignHorizontalJustifyStart /></button><button onClick={() => alignSelection("centerX")} title="가로 가운데"><LuAlignHorizontalJustifyCenter /></button><button onClick={() => alignSelection("right")} title="오른쪽"><LuAlignHorizontalJustifyEnd /></button><button onClick={() => alignSelection("top")} title="위"><LuAlignVerticalJustifyStart /></button><button onClick={() => alignSelection("centerY")} title="세로 가운데"><LuAlignVerticalJustifyCenter /></button><button onClick={() => alignSelection("bottom")} title="아래"><LuAlignVerticalJustifyEnd /></button><button onClick={() => distributeSelection("horizontal")} disabled={selectedLayerIds.length < 3} title="가로 균등"><LuAlignHorizontalSpaceBetween /></button><button onClick={() => distributeSelection("vertical")} disabled={selectedLayerIds.length < 3} title="세로 균등"><LuAlignVerticalSpaceBetween /></button></div>
                    <div className={styles.inlineButtonRow}><button onClick={groupSelectedLayers} disabled={selectedLayerIds.length < 2}><LuGroup /> 그룹</button><button onClick={ungroupSelectedLayers}><LuUngroup /> 해제</button><button onClick={toggleActiveLayerLock} disabled={!activeLayer}>{activeLayer?.locked ? <LuLockOpen /> : <LuLock />} 잠금</button></div>
                  </section>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* 중앙: 캔버스 */}
        <div className={styles.canvasArea}>
          <div className={styles.canvasViewport} ref={canvasViewportRef}>
            <div
              className={`${styles.canvasWrapper} ${showTransparencyGrid ? "" : styles.canvasWrapperPlain}`}
              style={{ width: `${canvasW * displayScale}px`, height: `${canvasH * displayScale}px` }}
            >
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className={styles.canvas}
                onPointerDown={handleMouseDown}
                onPointerMove={handleMouseMove}
                onPointerUp={handleMouseUp}
                onPointerCancel={handleMouseUp}
              />
            </div>
          </div>

          {directDrawOpen && (
            <div className={styles.directDrawBar} role="toolbar" aria-label="직접 그리기">
              <strong>직접 그리기</strong>
              <div className={styles.directDrawModes}>
                <button className={tool === "move" ? styles.directDrawActive : ""} onClick={() => activateTool("move")} title="선택·이동·크기·회전"><LuMove /> 선택</button>
                <button className={tool === "brush" ? styles.directDrawActive : ""} onClick={() => activateTool("brush")}><LuPencil /> 펜</button>
                <button className={tool === "eraser" ? styles.directDrawActive : ""} onClick={() => { clearStagedEraser(); setTool("eraser"); }}><LuEraser /> 지우개</button>
              </div>
              <select value={brushStyle} onChange={(event) => setBrushStyle(event.target.value as BrushStyle)} aria-label="직접 그리기 브러쉬 종류">{BRUSH_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select>
              <div className={styles.directDrawColors}>{DIRECT_DRAW_COLORS.map((color) => <button key={color} className={brushColor.toLowerCase() === color.toLowerCase() ? styles.directDrawColorActive : ""} style={{ backgroundColor: color }} onClick={() => setBrushColor(color)} title={color} />)}</div>
              <label><span>두께</span><input type="range" min={2} max={60} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /><b>{brushSize}px</b></label>
              <button className={styles.directDrawClose} onClick={() => { setDirectDrawOpen(false); activateTool("move"); }} title="직접 그리기 닫기"><LuX /> 닫기</button>
            </div>
          )}

          <div className={styles.utilityDock} role="toolbar" aria-label="캔버스 편집 명령">
            <button onClick={handleUndo} disabled={undoStack.current.length === 0} title="되돌리기"><LuUndo2 /></button>
            <button onClick={handleRedo} disabled={redoStack.current.length === 0} title="다시 실행"><LuRedo2 /></button>
            <span className={styles.utilityDivider} />
            <button onClick={() => imageInputRef.current?.click()} title="이미지 추가"><LuImagePlus /></button>
            <button className={tool === "crop" && !aiRegionMode ? styles.utilityActive : ""} onClick={() => { setAiRegionMode(false); setRegionSelectionPurpose(null); activateTool("crop"); }} title="자르기"><LuCrop /></button>
            {tool === "crop" && !aiRegionMode && (
              <>
                <button className={styles.utilityConfirm} onClick={() => { applyCrop(); setTool("move"); }} disabled={!cropRect || cropRect.w <= 5 || cropRect.h <= 5} title="자르기 적용"><LuCheck /> 적용</button>
                <button onClick={() => { setCropRect(null); setTool("move"); }} title="자르기 취소"><LuX /> 취소</button>
              </>
            )}
            <button onClick={() => void handleRemoveBackground()} disabled={cutoutLoading || !activeLayer?.canvas || activeLayer.locked} title="누끼 따기">
              {cutoutLoading ? <LuLoaderCircle className={styles.spin} /> : <LuEraser />} 누끼 <CreditCostBadge credits={AI_CREDIT_COSTS.cutout} />
            </button>
            <button className={directDrawOpen ? styles.utilityActive : ""} onClick={() => { setDirectDrawOpen((value) => !value); activateTool("brush"); }} title="직접 그리기"><LuPencil /> 직접 그리기</button>
            <span className={styles.utilityDivider} />
            <div className={styles.utilityAnchor}>
              <button className={layoutPickerOpen ? styles.utilityActive : ""} onClick={() => { setLayoutPickerOpen((value) => !value); setBackgroundOpen(false); setRedrawOpen(false); }} title="컷 레이아웃"><LuLayoutTemplate /> 레이아웃</button>
              {layoutPickerOpen && <div className={styles.utilityPopover}><strong>컷 레이아웃</strong><div className={styles.layoutChoiceGrid}><button onClick={() => addPanelLayout("single")}><LuSquare />1칸</button><button onClick={() => addPanelLayout("columns")}><LuColumns2 />좌우</button><button onClick={() => addPanelLayout("rows")}><LuRows2 />상하</button><button onClick={() => addPanelLayout("three")}><LuPanelTop />1+2</button><button onClick={() => addPanelLayout("twoOne")}><LuPanelsTopLeft />2+1</button><button onClick={() => addPanelLayout("four")}><LuGrid2X2 />2×2</button><button onClick={() => addPanelLayout("threeColumns")}><LuColumns3 />세로 3칸</button></div></div>}
            </div>
            <div className={styles.utilityAnchor}>
              <button className={backgroundOpen ? styles.utilityActive : ""} onClick={() => { setBackgroundOpen((value) => !value); setLayoutPickerOpen(false); setRedrawOpen(false); }} title="페이지 배경"><LuPanelBottom /> 배경</button>
              {backgroundOpen && (
                <div className={`${styles.utilityPopover} ${styles.backgroundUtilityPopover}`}>
                  <strong>페이지 배경</strong>
                  <div className={styles.segmentedControl}>{([['none', '없음'], ['solid', '단색'], ['linear', '그라데이션'], ['texture', '텍스처']] as const).map(([id, label]) => <button key={id} className={pageBackground.type === id ? styles.segmentActive : ""} onClick={() => updatePageBackground({ type: id })}>{label}</button>)}</div>
                  {pageBackground.type !== "none" && <label className={styles.utilityField}><span>기본색</span><input type="color" value={pageBackgroundColor} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ color: event.target.value }, false)} /><input value={pageBackgroundColor.slice(1).toUpperCase()} readOnly /></label>}
                  {pageBackground.type === "linear" && <><label className={styles.utilityField}><span>끝 색</span><input type="color" value={pageBackground.color2} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ color2: event.target.value }, false)} /><input value={pageBackground.color2.slice(1).toUpperCase()} readOnly /></label><label className={styles.utilityRange}><span>각도</span><input type="range" min={0} max={360} value={pageBackground.angle} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ angle: Number(event.target.value) }, false)} /><b>{pageBackground.angle}°</b></label><label className={styles.utilityRange}><span>비율</span><input type="range" min={5} max={95} value={pageBackground.stop} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ stop: Number(event.target.value) }, false)} /><b>{pageBackground.stop}%</b></label></>}
                  {pageBackground.type === "texture" && <div className={styles.segmentedControl}>{(['paper', 'dot', 'canvas'] as const).map((texture) => <button key={texture} className={pageBackground.texture === texture ? styles.segmentActive : ""} onClick={() => updatePageBackground({ texture })}>{texture === 'paper' ? '종이' : texture === 'dot' ? '도트' : '캔버스'}</button>)}</div>}
                </div>
              )}
            </div>
            <button onClick={() => setWatermarkOpen(true)} title="워터마크"><LuStamp /> 워터마크</button>
            <button onClick={() => setCaptionOpen(true)} title="캡션·내레이션"><LuCaptions /> 캡션</button>
            <div className={styles.utilityAnchor}>
              <button className={sfxOpen ? styles.utilityActive : ""} onClick={() => setSfxOpen((value) => !value)} title="효과음"><LuZap /> 효과음</button>
              {sfxOpen && <div className={`${styles.utilityPopover} ${styles.sfxUtilityPopover}`}><strong>효과음</strong><div>{SFX_PRESETS.map((text) => <button key={text} onClick={() => { addBubblePreset("sfx", text); setSfxOpen(false); }}>{text}</button>)}</div></div>}
            </div>
            <div className={styles.utilityAnchor}>
              <button className={redrawOpen || redrawJobId ? styles.utilityActive : ""} onClick={() => { setRedrawOpen((value) => !value); setRegionSelectionPurpose("redraw"); setBackgroundOpen(false); setLayoutPickerOpen(false); }} title="AI 다시 그리기">{redrawLoading || redrawJobId ? <LuLoaderCircle className={styles.spin} /> : <LuWandSparkles />} {redrawJobId ? `${redrawProgress}%` : "AI 다시 그리기"}</button>
              {redrawOpen && (
                <div className={`${styles.utilityPopover} ${styles.redrawUtilityPopover}`}>
                  <strong>AI 다시 그리기</strong>
                  <textarea rows={4} maxLength={2_000} value={redrawPrompt} onChange={(event) => setRedrawPrompt(event.target.value)} placeholder="수정할 내용을 입력하세요." />
                  <ImageModelSelector
                    modelId={redrawImageModel}
                    resolution={redrawImageSize}
                    onModelChange={setRedrawImageModel}
                    onResolutionChange={setRedrawImageSize}
                    disabled={redrawLoading || Boolean(redrawJobId)}
                    compact
                  />
                  <button className={styles.promptPresetButton} onClick={() => setRedrawPrompt("모든 말풍선·자막·글자를 제거하고 그 자리를 주변 배경·그림체와 자연스럽게 이어지도록 채운다.")}>글자·말풍선 지우기</button>
                  <div className={styles.segmentedControl}>{([['all', '전체'], ['auto', 'AI 자동'], ['rectangle', '사각형'], ['freehand', '직접 그리기']] as const).map(([mode, label]) => <button key={mode} className={redrawRegionMode === mode ? styles.segmentActive : ""} onClick={() => selectRedrawRegionMode(mode)}>{label}</button>)}</div>
                  {(redrawRegionMode === "rectangle" || redrawRegionMode === "freehand") && <p className={styles.toolHint}>{aiMaskCanvasRef.current ? "수정 영역이 선택되었습니다." : redrawRegionMode === "rectangle" ? "캔버스에서 사각형을 지정하세요." : "캔버스에 수정할 영역을 칠하세요."}</p>}
                  {redrawRegionMode === "freehand" && <label className={styles.utilityRange}><span>브러쉬</span><input type="range" min={12} max={180} value={maskBrushSize} onChange={(event) => setMaskBrushSize(Number(event.target.value))} /><b>{maskBrushSize}px</b></label>}
                  {redrawJobId && <div className={styles.aiProgress}><span style={{ width: `${redrawProgress}%` }} /><b>{redrawProgress}%</b></div>}
                  <button className={styles.utilityPrimary} onClick={() => void queueAiRedraw()} disabled={redrawLoading || Boolean(redrawJobId) || !redrawPrompt.trim()}>{redrawLoading ? <LuLoaderCircle className={styles.spin} /> : <LuWandSparkles />} 생성 <CreditCostBadge credits={getGenerationCreditCost("image", { imageModel: redrawImageModel, imageSize: redrawImageSize })} /></button>
                </div>
              )}
            </div>
            <span className={styles.utilityDivider} />
            <select value={aspect} onChange={(event) => handleAspectChange(event.target.value as AspectRatio)} aria-label="캔버스 비율"><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="3:4">3:4</option><option value="8:11">8:11</option><option value="9:16">9:16</option><option value="16:9">16:9</option></select>
            <button className={showGuides ? styles.utilityActive : ""} onClick={() => setShowGuides((value) => !value)} title="안내선"><LuGrid3X3 /></button>
            <button className={showTransparencyGrid ? styles.utilityActive : ""} onClick={() => setShowTransparencyGrid((value) => !value)} title="투명 영역"><LuSquare /></button>
            <button className={showOverflow ? styles.utilityActive : ""} onClick={() => setShowOverflow((value) => !value)} title="캔버스 밖 객체"><LuScanLine /></button>
            <button onClick={() => setZoom((value) => Math.max(25, value - 25))} title="축소"><LuZoomOut /></button>
            <button onClick={() => setZoom(100)} title="화면 맞춤">{zoom}%</button>
            <button onClick={() => setZoom((value) => Math.min(200, value + 25))} title="확대"><LuZoomIn /></button>
          </div>
          <input
            ref={imageInputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              void handleImageFiles(Array.from(event.target.files || [])).catch(() => window.alert("이미지를 추가하지 못했습니다."));
              event.target.value = "";
            }}
          />

          {/* 하단 툴바 */}
          {toolbarCollapsed && (
          <div className={styles.legacyToolbar} aria-hidden="true">
            <button
              className={styles.toolbarCollapseButton}
              onClick={() => setToolbarCollapsed((value) => !value)}
              title={toolbarCollapsed ? "도구 펼치기" : "도구 접기"}
            >{toolbarCollapsed ? <LuChevronsUp size={16} /> : <LuChevronsDown size={16} />}</button>
            <div className={styles.toolGroup}>
              <label className={styles.opacityLabel}>
                투명도
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((activeLayer?.opacity ?? 1) * 100)}
                  onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
                  className={styles.opacitySlider}
                />
                <span className={styles.opacityValue}>{Math.round((activeLayer?.opacity ?? 1) * 100)}%</span>
              </label>
            </div>
            <div className={styles.toolGroup}>
              <button
                className={`${styles.toolBtn} ${tool === "move" ? styles.toolActive : ""}`}
                onClick={() => { setTool("move"); setCropRect(null); }}
                title="이동"
              >
                <LuMove size={16} /> 이동
              </button>
              <button
                className={`${styles.toolBtn} ${tool === "crop" ? styles.toolActive : ""}`}
                onClick={() => setTool("crop")}
                title="크롭"
              >
                <LuCrop size={16} /> 크롭
              </button>
              <button
                className={styles.toolBtn}
                onClick={() => void handleRemoveBackground()}
                disabled={cutoutLoading || !activeLayer?.canvas || activeLayer?.locked}
                title={cutoutConfigured === false ? "remove.bg API 연결 필요" : "선택 이미지의 배경 제거"}
              >
                {cutoutLoading ? <LuLoaderCircle className={styles.spin} size={16} /> : <LuEraser size={16} />} 누끼
                <CreditCostBadge credits={AI_CREDIT_COSTS.cutout} />
              </button>
              {cutoutConfigured !== true && (
                <span className={styles.apiStatus}>{cutoutConfigured === null ? "API 확인 중" : "API 연결 필요"}</span>
              )}
            </div>
            <div className={styles.toolGroup}>
              <button className={styles.toolBtn} onClick={() => imageInputRef.current?.click()} title="이미지 객체 추가">
                <LuImagePlus size={16} />
              </button>
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  void handleImageFiles(Array.from(event.target.files || [])).catch(() => window.alert("이미지를 추가하지 못했습니다."));
                  event.target.value = "";
                }}
              />
              <button className={`${styles.toolBtn} ${tool === "brush" ? styles.toolActive : ""}`} onClick={() => setTool("brush")} title="펜">
                <LuPencil size={16} />
              </button>
              <button className={`${styles.toolBtn} ${tool === "eraser" ? styles.toolActive : ""}`} onClick={() => setTool("eraser")} title="지우개">
                <LuEraser size={16} />
              </button>
              <select
                className={styles.compactSelect}
                value={brushStyle}
                onChange={(event) => setBrushStyle(event.target.value as BrushStyle)}
                aria-label="브러시 종류"
              >
                {BRUSH_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
              </select>
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className={styles.brushColor} title="펜 색상" />
              <div className={styles.brushPalette} aria-label="펜 빠른 색상">
                {BRUSH_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={brushColor.toLowerCase() === color ? styles.brushPaletteActive : ""}
                    style={{ backgroundColor: color }}
                    onClick={() => setBrushColor(color)}
                    title={color}
                    aria-label={`펜 색상 ${color}`}
                  />
                ))}
              </div>
              <input
                className={styles.colorHex}
                value={brushColor.slice(1).toUpperCase()}
                maxLength={6}
                aria-label="HEX 색상 코드"
                onChange={(event) => {
                  const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                  if (value.length === 6) setBrushColor(`#${value}`);
                }}
              />
              <button className={`${styles.toolBtn} ${tool === "pipette" ? styles.toolActive : ""}`} onClick={() => setTool("pipette")} title="스포이트">
                <LuPipette size={16} />
              </button>
              <input type="range" min={2} max={60} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className={styles.brushSize} title="펜 굵기" />
              <span className={styles.opacityValue}>{brushSize}px</span>
            </div>
            <div className={styles.toolGroup}>
              <button
                className={`${styles.toolBtn} ${aspect === "1:1" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("1:1")}
              >
                1:1
              </button>
              <button
                className={`${styles.toolBtn} ${aspect === "4:5" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("4:5")}
              >
                4:5
              </button>
              <button
                className={`${styles.toolBtn} ${aspect === "3:4" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("3:4")}
                title="카드뉴스 960×1280"
              >
                3:4
              </button>
              <button
                className={`${styles.toolBtn} ${aspect === "8:11" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("8:11")}
                title="원고 800×1100"
              >
                8:11
              </button>
              <button
                className={`${styles.toolBtn} ${aspect === "9:16" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("9:16")}
              >
                9:16
              </button>
              <button
                className={`${styles.toolBtn} ${aspect === "16:9" ? styles.toolActive : ""}`}
                onClick={() => handleAspectChange("16:9")}
              >
                16:9
              </button>
            </div>
            <div className={styles.toolGroup}>
              <button className={styles.toolBtn} onClick={() => setZoom((value) => Math.max(25, value - 25))} title="축소"><LuZoomOut size={16} /></button>
              <button className={styles.toolBtn} onClick={() => setZoom(100)} title="화면에 맞추기"><LuMaximize2 size={16} /> {zoom}%</button>
              <button className={styles.toolBtn} onClick={() => setZoom((value) => Math.min(200, value + 25))} title="확대"><LuZoomIn size={16} /></button>
              <button className={`${styles.toolBtn} ${showGuides ? styles.toolActive : ""}`} onClick={() => setShowGuides((value) => !value)} title="3분할·중앙 안내선"><LuGrid3X3 size={16} /></button>
              <button className={`${styles.toolBtn} ${showTransparencyGrid ? styles.toolActive : ""}`} onClick={() => setShowTransparencyGrid((value) => !value)} title="투명 영역 보기"><LuSquare size={16} /></button>
              <button className={`${styles.toolBtn} ${showOverflow ? styles.toolActive : ""}`} onClick={() => setShowOverflow((value) => !value)} title="캔버스 밖 객체 표시"><LuScanLine size={16} /></button>
            </div>
            {activeLayer?.canvas && (
              <div className={`${styles.toolGroup} ${styles.objectControls}`}>
                <label className={styles.opacityLabel}>
                  크기
                  <input
                    type="range"
                    min={10}
                    max={300}
                    value={Math.round(((activeLayer.scaleX + activeLayer.scaleY) / 2) * 100)}
                    onPointerDown={saveUndo}
                    onChange={(event) => {
                      const value = Number(event.target.value) / 100;
                      setDirty(true);
                      setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, scale: value, scaleX: value, scaleY: value } : layer));
                    }}
                    className={styles.opacitySlider}
                    disabled={activeLayer.locked}
                  />
                </label>
                {([
                  ["X", Math.round(activeLayer.x), (value: number) => ({ x: value })],
                  ["Y", Math.round(activeLayer.y), (value: number) => ({ y: value })],
                  ["W", Math.round(canvasW * activeLayer.scaleX), (value: number) => ({ scaleX: Math.max(0.05, value / canvasW) })],
                  ["H", Math.round(canvasH * activeLayer.scaleY), (value: number) => ({ scaleY: Math.max(0.05, value / canvasH) })],
                  ["각도", Math.round(activeLayer.rotation), (value: number) => ({ rotation: Math.max(-180, Math.min(180, value)) })],
                ] as const).map(([label, value, createUpdate]) => (
                  <label key={label} className={styles.numericField}>
                    <span>{label}</span>
                    <input
                      type="number"
                      value={value}
                      onFocus={saveUndo}
                      onChange={(event) => {
                        setDirty(true);
                        const update = createUpdate(Number(event.target.value) || 0);
                        setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, ...update } : layer));
                      }}
                      disabled={activeLayer.locked}
                    />
                  </label>
                ))}
                <button className={styles.toolBtn} onClick={() => flipActiveLayer("h")} disabled={activeLayer.locked} title="좌우 뒤집기"><LuFlipHorizontal2 size={16} /></button>
                <button className={styles.toolBtn} onClick={() => flipActiveLayer("v")} disabled={activeLayer.locked} title="상하 뒤집기"><LuFlipVertical2 size={16} /></button>
                <button className={styles.toolBtn} onClick={() => moveLayer(activeLayer.id, "top")} disabled={activeLayer.locked || layers.at(-1)?.id === activeLayer.id} title="맨 앞으로"><LuArrowUpToLine size={16} /></button>
                <button className={styles.toolBtn} onClick={() => moveLayer(activeLayer.id, "bottom")} disabled={activeLayer.locked || layers[0]?.id === activeLayer.id} title="맨 뒤로"><LuArrowDownToLine size={16} /></button>
                <select
                  className={styles.compactSelect}
                  value={activeLayer.filter}
                  onChange={(event) => {
                    saveUndo();
                    const filter = event.target.value as CanvasImageFilter;
                    setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, filter } : layer));
                  }}
                  disabled={activeLayer.locked}
                  aria-label="이미지 필터"
                >
                  {IMAGE_FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
                </select>
                {activeLayer.filter !== "original" && (
                  <label className={styles.opacityLabel}>
                    강도
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(activeLayer.filterIntensity * 100)}
                      onPointerDown={saveUndo}
                      onChange={(event) => {
                        setDirty(true);
                        setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, filterIntensity: Number(event.target.value) / 100 } : layer));
                      }}
                      className={styles.brushSize}
                    />
                  </label>
                )}
                <label className={styles.toggleCompact} title="바로 아래 레이어의 불투명 영역 안에만 표시">
                  <input
                    type="checkbox"
                    checked={activeLayer.clipToBelow}
                    disabled={activeLayer.locked || layers[0]?.id === activeLayer.id}
                    onChange={(event) => {
                      saveUndo();
                      setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, clipToBelow: event.target.checked } : layer));
                    }}
                  /> 클리핑
                </label>
              </div>
            )}
            <div className={styles.toolGroup} aria-label="정렬과 분배">
              <button className={styles.toolBtn} onClick={() => alignSelection("left")} disabled={!selectedBubbleId && !activeLayer} title="왼쪽 정렬"><LuAlignHorizontalJustifyStart size={16} /></button>
              <button className={styles.toolBtn} onClick={() => alignSelection("centerX")} disabled={!selectedBubbleId && !activeLayer} title="가로 가운데 정렬"><LuAlignHorizontalJustifyCenter size={16} /></button>
              <button className={styles.toolBtn} onClick={() => alignSelection("right")} disabled={!selectedBubbleId && !activeLayer} title="오른쪽 정렬"><LuAlignHorizontalJustifyEnd size={16} /></button>
              <button className={styles.toolBtn} onClick={() => alignSelection("top")} disabled={!selectedBubbleId && !activeLayer} title="위쪽 정렬"><LuAlignVerticalJustifyStart size={16} /></button>
              <button className={styles.toolBtn} onClick={() => alignSelection("centerY")} disabled={!selectedBubbleId && !activeLayer} title="세로 가운데 정렬"><LuAlignVerticalJustifyCenter size={16} /></button>
              <button className={styles.toolBtn} onClick={() => alignSelection("bottom")} disabled={!selectedBubbleId && !activeLayer} title="아래쪽 정렬"><LuAlignVerticalJustifyEnd size={16} /></button>
              <button className={styles.toolBtn} onClick={() => distributeSelection("horizontal")} disabled={selectedLayerIds.length < 3} title="가로 균등 분배"><LuAlignHorizontalSpaceBetween size={16} /></button>
              <button className={styles.toolBtn} onClick={() => distributeSelection("vertical")} disabled={selectedLayerIds.length < 3} title="세로 균등 분배"><LuAlignVerticalSpaceBetween size={16} /></button>
              <button className={styles.toolBtn} onClick={toggleActiveLayerLock} disabled={!activeLayer} title="선택 레이어 잠금 또는 해제 (Ctrl+L)">
                {activeLayer?.locked ? <LuLockOpen size={16} /> : <LuLock size={16} />}
              </button>
            </div>
            <div className={styles.toolGroup} aria-label="툰 도구">
              <button className={`${styles.toolBtn} ${watermarkOpen ? styles.toolActive : ""}`} onClick={() => setWatermarkOpen(true)} title="워터마크 설정"><LuStamp size={16} /> 워터마크</button>
              <button className={`${styles.toolBtn} ${captionOpen ? styles.toolActive : ""}`} onClick={() => setCaptionOpen(true)} title="캡션·내레이션 설정"><LuCaptions size={16} /> 캡션</button>
              <div className={styles.popupAnchor}>
                <button className={`${styles.toolBtn} ${sfxOpen ? styles.toolActive : ""}`} onClick={() => setSfxOpen((value) => !value)} title="효과음 라이브러리"><LuZap size={16} /> 효과음</button>
                {sfxOpen && (
                  <div className={`${styles.bubblePopup} ${styles.sfxPopup}`}>
                    {SFX_PRESETS.map((text) => (
                      <button key={text} onClick={() => { addBubblePreset("sfx", text); setSfxOpen(false); }}>{text}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.popupAnchor}>
                <button className={`${styles.toolBtn} ${backgroundOpen ? styles.toolActive : ""}`} onClick={() => setBackgroundOpen((value) => !value)} title="페이지 배경 제작기">
                  <LuPanelBottom size={16} /> 배경
                </button>
                {backgroundOpen && (
                  <div className={`${styles.bubblePopup} ${styles.backgroundPopup}`}>
                    <div className={styles.segmentedControl}>
                      {([[
                        "none", "없음"
                      ], ["solid", "단색"], ["linear", "그라데이션"], ["texture", "텍스처"]] as const).map(([id, label]) => (
                        <button key={id} className={pageBackground.type === id ? styles.segmentActive : ""} onClick={() => updatePageBackground({ type: id })}>{label}</button>
                      ))}
                    </div>
                    {pageBackground.type !== "none" && (
                      <div className={styles.backgroundRows}>
                        <label><span>기본색</span><input type="color" value={pageBackgroundColor} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ color: event.target.value }, false)} /></label>
                        {pageBackground.type === "linear" && (
                          <>
                            <label><span>끝 색</span><input type="color" value={pageBackground.color2} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ color2: event.target.value }, false)} /></label>
                            <label><span>각도</span><input type="range" min={0} max={360} value={pageBackground.angle} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ angle: Number(event.target.value) }, false)} /><b>{pageBackground.angle}°</b></label>
                            <label><span>비율</span><input type="range" min={5} max={95} value={pageBackground.stop} onPointerDown={saveUndo} onChange={(event) => updatePageBackground({ stop: Number(event.target.value) }, false)} /><b>{pageBackground.stop}%</b></label>
                          </>
                        )}
                        {pageBackground.type === "texture" && (
                          <div className={styles.segmentedControl}>
                            {(["paper", "dot", "canvas"] as const).map((texture) => (
                              <button key={texture} className={pageBackground.texture === texture ? styles.segmentActive : ""} onClick={() => updatePageBackground({ texture })}>
                                {texture === "paper" ? "종이" : texture === "dot" ? "도트" : "캔버스"}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button className={`${styles.toolBtn} ${ocrOpen ? styles.toolActive : ""}`} onClick={toggleOcrPanel} disabled={ocrLoading} title="이미지 글자 추출">
                {ocrLoading ? <LuLoaderCircle className={styles.spin} size={16} /> : <LuScanText size={16} />} 텍스트 추출
              </button>
              {ocrOpen && (
                <div className={`${styles.bubblePopup} ${styles.aiToolPopup}`}>
                  <strong>이미지 글자 추출</strong>
                  <div className={styles.segmentedControl} aria-label="글자 추출 영역">
                    {([["all", "전체"], ["rectangle", "사각형"], ["freehand", "자유형식"]] as const).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        className={ocrRegionMode === mode ? styles.segmentActive : ""}
                        onClick={() => selectOcrRegionMode(mode)}
                      >{label}</button>
                    ))}
                  </div>
                  {ocrRegionMode !== "all" && (
                    <div className={styles.ocrSelectionStatus}>
                      <span>{aiMaskCanvasRef.current ? "영역 선택됨" : ocrRegionMode === "rectangle" ? "캔버스에서 사각형 선택" : "캔버스에 추출 영역 그리기"}</span>
                      <button type="button" onClick={() => selectOcrRegionMode(ocrRegionMode)}>다시 선택</button>
                    </div>
                  )}
                  <button className={styles.aiToolAction} onClick={() => void extractCanvasText()} disabled={ocrLoading || (ocrRegionMode !== "all" && !aiMaskCanvasRef.current)}>
                    {ocrLoading ? <LuLoaderCircle className={styles.spin} /> : <LuScanText />} 글자 추출
                    <CreditCostBadge credits={AI_CREDIT_COSTS.ocr} />
                  </button>
                  {ocrLoading ? (
                    <div className={styles.aiToolLoading}><LuLoaderCircle className={styles.spin} /> 분석 중</div>
                  ) : ocrText ? (
                    <>
                      <strong>추출 결과</strong>
                      <textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} rows={7} placeholder="추출된 글자가 여기에 표시됩니다." />
                      <button className={styles.aiToolAction} onClick={addExtractedText} disabled={!ocrText.trim()}><LuType size={14} /> 텍스트 객체로 추가</button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button className={`${styles.toolBtn} ${redrawOpen ? styles.toolActive : ""}`} onClick={() => {
                setRedrawOpen((value) => !value);
                setOcrOpen(false);
                setRegionSelectionPurpose("redraw");
              }} title="현재 컷 AI 다시 그리기">
                {redrawLoading || redrawJobId ? <LuLoaderCircle className={styles.spin} size={16} /> : <LuWandSparkles size={16} />} {redrawJobId ? `AI ${redrawProgress}%` : "AI 다시 그리기"}
              </button>
              {redrawOpen && (
                <div className={`${styles.bubblePopup} ${styles.aiToolPopup}`}>
                  <strong>수정 요청</strong>
                  <textarea value={redrawPrompt} onChange={(event) => setRedrawPrompt(event.target.value)} rows={5} maxLength={2_000} placeholder="예: 배경은 유지하고 인물 표정을 놀란 표정으로 변경" />
                  <ImageModelSelector
                    modelId={redrawImageModel}
                    resolution={redrawImageSize}
                    onModelChange={setRedrawImageModel}
                    onResolutionChange={setRedrawImageSize}
                    disabled={redrawLoading || Boolean(redrawJobId)}
                    compact
                  />
                  <div className={styles.aiPresetRow}>
                    <button
                      type="button"
                      className={styles.aiPresetButton}
                      onClick={() => setRedrawPrompt("모든 말풍선·자막·글자를 제거하고 그 자리를 주변 배경·그림체와 자연스럽게 이어지도록 채운다.")}
                    >글자·말풍선 지우기</button>
                  </div>
                  <div className={styles.segmentedControl} aria-label="AI 수정 영역 방식">
                    {([[
                      "all", "전체"
                    ], ["auto", "AI 자동"], ["rectangle", "사각형"], ["freehand", "자유 선택"]] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        className={redrawRegionMode === mode ? styles.segmentActive : ""}
                        onClick={() => {
                          setRedrawRegionMode(mode);
                          setRegionSelectionPurpose("redraw");
                          if (mode === "all" || mode === "auto") {
                            aiMaskCanvasRef.current = null;
                            setMaskRevision((value) => value + 1);
                            setTool("move");
                            setAiRegionMode(false);
                            setRedrawUseRegion(mode === "auto");
                          } else if (mode === "rectangle") {
                            aiMaskCanvasRef.current = null;
                            setMaskRevision((value) => value + 1);
                            setCropRect(null);
                            setTool("crop");
                            setAiRegionMode(true);
                            setRedrawUseRegion(true);
                          } else {
                            if (redrawRegionMode !== "freehand") aiMaskCanvasRef.current = null;
                            setMaskRevision((value) => value + 1);
                            setTool("mask");
                            setAiRegionMode(false);
                            setRedrawUseRegion(true);
                          }
                        }}
                      >{label}</button>
                    ))}
                  </div>
                  {redrawRegionMode === "rectangle" && (
                    <p className={styles.aiRegionHint}>{aiRegionMode ? "캔버스에서 수정할 사각형을 드래그하세요." : "빨간 영역 안쪽만 생성 결과로 교체합니다."}</p>
                  )}
                  {redrawRegionMode === "freehand" && (
                    <div className={styles.maskControls}>
                      <label>브러시 <input type="range" min={12} max={180} value={maskBrushSize} onChange={(event) => setMaskBrushSize(Number(event.target.value))} /><span>{maskBrushSize}px</span></label>
                      <button onClick={() => { aiMaskCanvasRef.current = null; setMaskRevision((value) => value + 1); }}>선택 지우기</button>
                    </div>
                  )}
                  {redrawRegionMode === "auto" && <p className={styles.aiRegionHint}>AI가 요청과 직접 관련된 최소 영역을 찾고, 그 밖의 픽셀은 원본으로 복원합니다.</p>}
                  {redrawJobId && (
                    <div className={styles.aiProgress}><span style={{ width: `${redrawProgress}%` }} /><b>{redrawProgress}%</b></div>
                  )}
                  <button className={styles.aiToolAction} onClick={() => void queueAiRedraw()} disabled={redrawLoading || Boolean(redrawJobId) || !redrawPrompt.trim()}>
                    {redrawLoading ? <LuLoaderCircle className={styles.spin} /> : <LuWandSparkles />} 작업 시작
                    <CreditCostBadge credits={getGenerationCreditCost("image", { imageModel: redrawImageModel, imageSize: redrawImageSize })} />
                  </button>
                </div>
              )}
            </div>
            <div className={styles.toolGroup}>
              <button
                className={styles.toolBtn}
                onClick={handleUndo}
                disabled={undoStack.current.length === 0}
                title="되돌리기 (Ctrl+Z)"
              >
                <LuUndo2 size={16} />
              </button>
              <button
                className={styles.toolBtn}
                onClick={handleRedo}
                disabled={redoStack.current.length === 0}
                title="다시 실행 (Ctrl+Shift+Z)"
              >
                <LuRedo2 size={16} />
              </button>
            </div>
            {/* 말풍선 도구 (1개 버튼 + 팝업) */}
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button
                className={`${styles.toolBtn} ${tool === "bubble" ? styles.toolActive : ""}`}
                onClick={() => {
                  if (tool === "bubble") { setTool("move"); setSelectedBubbleId(null); }
                  else setTool("bubble");
                }}
                title="말풍선"
              >
                <LuMessageCircle size={16} /> 말풍선
              </button>
              {tool === "bubble" && (
                <div className={styles.bubblePopup}>
                  <div className={styles.bubblePopupGrid}>
                    {(["classic", "thought", "spiky", "angry", "needle"] as const).map((bt) => (
                      <button
                        key={bt}
                        className={`${styles.bubblePreviewBtn} ${bubbleType === bt ? styles.bubblePreviewBtnActive : ""}`}
                        onClick={() => { setBubbleType(bt as BubbleType); setSelectedBubbleId(null); }}
                        title={bt}
                      >
                        <canvas
                          width={48}
                          height={36}
                          ref={(el) => {
                            if (!el) return;
                            const ctx = el.getContext("2d");
                            if (!ctx) return;
                            ctx.clearRect(0, 0, 48, 36);
                            const isThought = bt === "thought";
                            const preview: SpeechBubble = {
                              id: "preview", type: bt,
                              x: isThought ? 26 : 24,
                              y: isThought ? 14 : 18,
                              width: isThought ? 28 : 38,
                              height: isThought ? 20 : 26,
                              fillColor: "#ffffff", strokeColor: "#000000",
                              strokeWidth: bt === "needle" ? 0.8 : 1.5,
                              opacity: 1,
                              tailEnabled: bt === "classic" || bt === "thought",
                              tailTipX: isThought ? 10 : 14,
                              tailTipY: 34,
                              tailWidth: 6,
                            };
                            drawBubble(ctx, preview);
                          }}
                        />
                      </button>
                    ))}
                  </div>
                  <button type="button" className={styles.customBubbleButton} onClick={addCustomBubble}>
                    <LuSlidersHorizontal size={14} /> 커스텀 말풍선 만들기
                  </button>
                  {/* 선택된 말풍선 속성 */}
                  {selectedBubble && (
                    <>
                      <div className={styles.bubblePopupDivider} />
                      <div className={styles.bubblePopupProps}>
                        {customBubbleOpen && (
                          <div className={styles.customBubbleControls}>
                            <div className={styles.segmentedControl}>
                              {([[
                                "classic", "타원"
                              ], ["roundedRectangle", "둥근 사각"], ["spiky", "뾰족"], ["cloud", "구름"]] as const).map(([type, label]) => (
                                <button key={type} className={selectedBubble.type === type ? styles.segmentActive : ""} onClick={() => updateBubble(selectedBubble.id, { type })}>{label}</button>
                              ))}
                            </div>
                            <div className={styles.bubblePopupRow}>
                              <label className={styles.numericField}><span>W</span><input type="number" min={40} max={canvasW * 2} value={Math.round(selectedBubble.width)} onChange={(event) => updateBubble(selectedBubble.id, { width: Number(event.target.value) })} /></label>
                              <label className={styles.numericField}><span>H</span><input type="number" min={30} max={canvasH * 2} value={Math.round(selectedBubble.height)} onChange={(event) => updateBubble(selectedBubble.id, { height: Number(event.target.value) })} /></label>
                              <label className={styles.toggleCompact}><input type="checkbox" checked={selectedBubble.tailEnabled} onChange={(event) => updateBubble(selectedBubble.id, { tailEnabled: event.target.checked })} /> 꼬리</label>
                            </div>
                            <div className={styles.bubblePopupRow}>
                              <span className={styles.bubblePopupLabel}>선</span>
                              <select value={selectedBubble.strokeStyle || "solid"} onChange={(event) => updateBubble(selectedBubble.id, { strokeStyle: event.target.value as SpeechBubble["strokeStyle"] })}>
                                <option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option><option value="rough">손그림</option>
                              </select>
                              <label className={styles.toggleCompact}><input type="checkbox" checked={Boolean(selectedBubble.gradientColor)} onChange={(event) => updateBubble(selectedBubble.id, { gradientColor: event.target.checked ? "#bfdbfe" : undefined })} /> 그라데이션</label>
                            </div>
                            {selectedBubble.gradientColor && (
                              <div className={styles.bubblePopupRow}>
                                <input type="color" value={selectedBubble.gradientColor} onChange={(event) => updateBubble(selectedBubble.id, { gradientColor: event.target.value })} title="끝 색" />
                                <input type="range" min={0} max={360} value={selectedBubble.gradientAngle || 0} onChange={(event) => updateBubble(selectedBubble.id, { gradientAngle: Number(event.target.value) })} title="그라데이션 각도" />
                              </div>
                            )}
                            <div className={styles.bubblePopupRow}>
                              <span className={styles.bubblePopupLabel}>모불모불</span>
                              <input type="range" min={0} max={100} value={Math.round((selectedBubble.roughness || 0) * 100)} onChange={(event) => updateBubble(selectedBubble.id, { roughness: Number(event.target.value) / 100 })} />
                            </div>
                            <div className={styles.bubblePopupRow}>
                              <span className={styles.bubblePopupLabel}>구불구불</span>
                              <input type="range" min={0} max={100} value={Math.round((selectedBubble.wobble || 0) * 100)} onChange={(event) => updateBubble(selectedBubble.id, { wobble: Number(event.target.value) / 100 })} />
                            </div>
                            <div className={styles.bubblePopupRow}>
                              <span className={styles.bubblePopupLabel}>선 투명도</span>
                              <input type="range" min={0} max={100} value={Math.round((selectedBubble.strokeOpacity ?? 1) * 100)} onChange={(event) => updateBubble(selectedBubble.id, { strokeOpacity: Number(event.target.value) / 100 })} />
                            </div>
                            <div className={styles.bubblePopupRow}>
                              <span className={styles.bubblePopupLabel}>내부 투명도</span>
                              <input type="range" min={0} max={100} value={Math.round((selectedBubble.fillOpacity ?? 1) * 100)} onChange={(event) => updateBubble(selectedBubble.id, { fillOpacity: Number(event.target.value) / 100 })} />
                            </div>
                            {selectedBubble.tailEnabled && (
                              <div className={styles.bubblePopupRow}>
                                <span className={styles.bubblePopupLabel}>꼬리 폭</span>
                                <input type="range" min={8} max={96} value={selectedBubble.tailWidth} onChange={(event) => updateBubble(selectedBubble.id, { tailWidth: Number(event.target.value) })} />
                              </div>
                            )}
                            <button className={styles.clearTextStyleButton} onClick={() => void downloadBubblePng(selectedBubble)}>투명 PNG로 저장</button>
                          </div>
                        )}
                        <textarea
                          className={styles.bubbleTextInput}
                          value={selectedBubble.text ?? ""}
                          rows={3}
                          placeholder="대사 입력"
                          onSelect={(event) => {
                            textSelectionRef.current = {
                              start: event.currentTarget.selectionStart,
                              end: event.currentTarget.selectionEnd,
                            };
                          }}
                          onChange={(e) => updateBubble(selectedBubble.id, { text: e.target.value, textRuns: [] })}
                        />
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>글자</span>
                          <input
                            type="color"
                            value={selectedBubble.textColor ?? "#111111"}
                            onChange={(e) => applySelectedTextStyle({ textColor: e.target.value })}
                            title="글자색"
                          />
                          <input
                            type="number"
                            min={8}
                            max={96}
                            value={selectedBubble.fontSize ?? 24}
                            onChange={(e) => updateBubble(selectedBubble.id, { fontSize: Number(e.target.value) })}
                            className={styles.fontSizeInput}
                            title="글자 크기"
                          />
                          <button
                            className={`${styles.textStyleButton} ${selectedBubble.fontWeight === "bold" ? styles.textStyleActive : ""}`}
                            onClick={() => applySelectedTextStyle({ fontWeight: selectedBubble.fontWeight === "bold" ? "normal" : "bold" })}
                            title="굵게"
                          >B</button>
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>정렬</span>
                          {(["left", "center", "right"] as const).map((align) => (
                            <button
                              key={align}
                              className={`${styles.textAlignButton} ${(selectedBubble.textAlign ?? "center") === align ? styles.textStyleActive : ""}`}
                              onClick={() => updateBubble(selectedBubble.id, { textAlign: align })}
                            >
                              {align === "left" ? "좌" : align === "right" ? "우" : "중"}
                            </button>
                          ))}
                          <button
                            className={`${styles.textStyleButton} ${selectedBubble.fontItalic ? styles.textStyleActive : ""}`}
                            onClick={() => applySelectedTextStyle({ fontItalic: !selectedBubble.fontItalic })}
                            title="기울임"
                            style={{ fontStyle: "italic" }}
                          >I</button>
                          <button
                            className={`${styles.textStyleButton} ${selectedBubble.underline ? styles.textStyleActive : ""}`}
                            onClick={() => applySelectedTextStyle({ underline: !selectedBubble.underline })}
                            title="밑줄"
                            style={{ textDecoration: "underline" }}
                          >U</button>
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>서체</span>
                          <select
                            value={selectedBubble.fontFamily ?? "sans-serif"}
                            onChange={(e) => updateBubble(selectedBubble.id, { fontFamily: e.target.value })}
                            title="글꼴"
                          >
                            {BUBBLE_FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>외곽선</span>
                          <input
                            type="color"
                            value={selectedBubble.outlineColor ?? "#ffffff"}
                            onChange={(e) => updateBubble(selectedBubble.id, { outlineColor: e.target.value })}
                            title="외곽선 색"
                          />
                          <input
                            type="number"
                            min={0}
                            max={12}
                            value={selectedBubble.outlineWidth ?? 0}
                            onChange={(e) => updateBubble(selectedBubble.id, { outlineWidth: Number(e.target.value) })}
                            className={styles.fontSizeInput}
                            title="외곽선 두께"
                          />
                          <input
                            type="number"
                            min={-2}
                            max={20}
                            step={0.5}
                            value={selectedBubble.letterSpacing ?? 0}
                            onChange={(e) => updateBubble(selectedBubble.id, { letterSpacing: Number(e.target.value) })}
                            className={styles.fontSizeInput}
                            title="자간(px)"
                          />
                          <input
                            type="number"
                            min={1}
                            max={2.5}
                            step={0.05}
                            value={selectedBubble.lineHeightScale ?? 1.28}
                            onChange={(e) => updateBubble(selectedBubble.id, { lineHeightScale: Number(e.target.value) })}
                            className={styles.fontSizeInput}
                            title="행간(배)"
                          />
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>배경</span>
                          {["#ffffff", "transparent", "#000000", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ec4899"].map((c) => (
                            <button
                              key={c}
                              className={`${styles.bubbleColorBtn} ${selectedBubble.fillColor === c ? styles.bubbleColorActive : ""}`}
                              style={{ background: c === "transparent" ? "linear-gradient(45deg, #999 25%, transparent 25%, transparent 75%, #999 75%), linear-gradient(45deg, #999 25%, transparent 25%, transparent 75%, #999 75%)" : c, backgroundSize: "6px 6px", backgroundPosition: "0 0, 3px 3px" }}
                              onClick={() => updateBubble(selectedBubble.id, { fillColor: c })}
                              title={c === "transparent" ? "투명" : c}
                            />
                          ))}
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>선색</span>
                          {["#000000", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#6b7280"].map((c) => (
                            <button
                              key={c}
                              className={`${styles.bubbleColorBtn} ${selectedBubble.strokeColor === c ? styles.bubbleColorActive : ""}`}
                              style={{ background: c }}
                              onClick={() => updateBubble(selectedBubble.id, { strokeColor: c })}
                            />
                          ))}
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>두께</span>
                          <input type="range" min={1} max={8} value={selectedBubble.strokeWidth} onChange={(e) => updateBubble(selectedBubble.id, { strokeWidth: Number(e.target.value) })} style={{ width: 80 }} />
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>투명도</span>
                          <input type="range" min={0} max={100} value={Math.round(selectedBubble.opacity * 100)} onChange={(e) => updateBubble(selectedBubble.id, { opacity: Number(e.target.value) / 100 })} style={{ width: 80 }} />
                        </div>
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>각도</span>
                          <input type="range" min={-180} max={180} value={Math.round(selectedBubble.rotation ?? 0)} onChange={(e) => updateBubble(selectedBubble.id, { rotation: Number(e.target.value) })} style={{ width: 80 }} />
                          <span>{Math.round(selectedBubble.rotation ?? 0)}°</span>
                        </div>
                        <button className={styles.bubbleDeleteBtn} onClick={() => deleteBubble(selectedBubble.id)}>
                          <LuTrash2 size={12} /> 삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button
                className={`${styles.toolBtn} ${tool === "text" ? styles.toolActive : ""}`}
                onClick={() => {
                  if (tool === "text") { setTool("move"); setSelectedBubbleId(null); }
                  else setTool("text");
                }}
                title="텍스트"
              >
                <LuType size={16} /> 텍스트
              </button>
              {tool === "text" && selectedBubble?.type === "text" && (
                <div className={`${styles.bubblePopup} ${styles.textPopup}`}>
                  <textarea
                    className={styles.bubbleTextInput}
                    value={selectedBubble.text ?? ""}
                    rows={3}
                    autoFocus
                    onSelect={(event) => {
                      textSelectionRef.current = {
                        start: event.currentTarget.selectionStart,
                        end: event.currentTarget.selectionEnd,
                      };
                    }}
                    onChange={(e) => updateBubble(selectedBubble.id, { text: e.target.value, textRuns: [] })}
                  />
                  <select className={styles.fontSelect} value={selectedBubble.fontFamily ?? BUBBLE_FONT_FAMILIES[0].id} onChange={(event) => updateBubble(selectedBubble.id, { fontFamily: event.target.value })}>
                    {BUBBLE_FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                  </select>
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>글자</span>
                    <input type="color" value={selectedBubble.textColor ?? "#111111"} onChange={(e) => applySelectedTextStyle({ textColor: e.target.value })} />
                    <input type="number" min={8} max={96} value={selectedBubble.fontSize ?? 24} onChange={(e) => updateBubble(selectedBubble.id, { fontSize: Number(e.target.value) })} className={styles.fontSizeInput} />
                    {([300, 400, 700, 900] as const).map((weight) => (
                      <button key={weight} className={`${styles.textStyleButton} ${selectedBubble.fontWeight === weight ? styles.textStyleActive : ""}`} onClick={() => applySelectedTextStyle({ fontWeight: weight })} title={`${weight} 굵기`}>{weight === 300 ? "L" : weight === 400 ? "R" : weight === 700 ? "B" : "XB"}</button>
                    ))}
                  </div>
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>정렬</span>
                    {(["left", "center", "right"] as const).map((align) => (
                      <button key={align} className={`${styles.textAlignButton} ${(selectedBubble.textAlign ?? "center") === align ? styles.textStyleActive : ""}`} onClick={() => updateBubble(selectedBubble.id, { textAlign: align })}>
                        {align === "left" ? "좌" : align === "right" ? "우" : "중"}
                      </button>
                    ))}
                    <button className={`${styles.textStyleButton} ${selectedBubble.fontItalic ? styles.textStyleActive : ""}`} onClick={() => applySelectedTextStyle({ fontItalic: !selectedBubble.fontItalic })} style={{ fontStyle: "italic" }} title="선택 글자 기울임">I</button>
                    <button className={`${styles.textStyleButton} ${selectedBubble.underline ? styles.textStyleActive : ""}`} onClick={() => applySelectedTextStyle({ underline: !selectedBubble.underline })} style={{ textDecoration: "underline" }} title="선택 글자 밑줄">U</button>
                    <button className={styles.textStyleButton} onClick={() => applySelectedTextStyle({ baselineOffset: -Math.max(2, (selectedBubble.fontSize || 24) * 0.18) })} title="선택 글자 위로">↑</button>
                    <button className={styles.textStyleButton} onClick={() => applySelectedTextStyle({ baselineOffset: Math.max(2, (selectedBubble.fontSize || 24) * 0.18) })} title="선택 글자 아래로">↓</button>
                  </div>
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>외곽선</span>
                    <input type="color" value={selectedBubble.outlineColor || "#ffffff"} onChange={(event) => updateBubble(selectedBubble.id, { outlineColor: event.target.value })} />
                    <input type="number" min={0} max={12} value={selectedBubble.outlineWidth || 0} onChange={(event) => updateBubble(selectedBubble.id, { outlineWidth: Number(event.target.value) })} className={styles.fontSizeInput} />
                    <input type="number" min={-2} max={20} step={0.5} value={selectedBubble.letterSpacing || 0} onChange={(event) => updateBubble(selectedBubble.id, { letterSpacing: Number(event.target.value) })} className={styles.fontSizeInput} title="자간" />
                    <input type="number" min={1} max={2.5} step={0.05} value={selectedBubble.lineHeightScale || 1.28} onChange={(event) => updateBubble(selectedBubble.id, { lineHeightScale: Number(event.target.value) })} className={styles.fontSizeInput} title="행간" />
                  </div>
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>각도</span>
                    <input type="range" min={-180} max={180} value={Math.round(selectedBubble.rotation ?? 0)} onChange={(event) => updateBubble(selectedBubble.id, { rotation: Number(event.target.value) })} />
                    <span>{Math.round(selectedBubble.rotation ?? 0)}°</span>
                    <span className={styles.bubblePopupLabel}>투명도</span>
                    <input type="range" min={0} max={100} value={Math.round(selectedBubble.opacity * 100)} onChange={(event) => updateBubble(selectedBubble.id, { opacity: Number(event.target.value) / 100 })} />
                  </div>
                  <button className={styles.clearTextStyleButton} onClick={() => updateBubble(selectedBubble.id, { textRuns: [], baselineOffset: 0 })}>선택 문자 서식 초기화</button>
                  <button className={styles.bubbleDeleteBtn} onClick={() => deleteBubble(selectedBubble.id)}><LuTrash2 size={12} /> 삭제</button>
                </div>
              )}
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button
                className={`${styles.toolBtn} ${tool === "shape" ? styles.toolActive : ""}`}
                onClick={() => {
                  if (tool === "shape") { setTool("move"); setSelectedBubbleId(null); }
                  else setTool("shape");
                }}
                title="도형"
              >
                <LuShapes size={16} /> 도형
              </button>
              {tool === "shape" && (
                <div className={`${styles.bubblePopup} ${styles.shapePopup}`}>
                  <div className={styles.shapeGrid}>
                    {([
                      ["rectangle", "사각형", LuSquare],
                      ["circle", "원", LuCircle],
                      ["ellipse", "타원", LuCircle],
                      ["line", "선", LuMinus],
                      ["arrow", "화살표", LuArrowRight],
                      ["star", "별", LuStar],
                    ] as const).map(([type, label, Icon]) => (
                      <button
                        key={type}
                        className={`${styles.shapeButton} ${shapeType === type ? styles.textStyleActive : ""}`}
                        onClick={() => { setShapeType(type); setSelectedBubbleId(null); }}
                        title={label}
                      >
                        <Icon size={17} />
                      </button>
                    ))}
                  </div>
                  {selectedBubble && ["rectangle", "roundedRectangle", "ellipse", "line", "arrow", "star"].includes(selectedBubble.type) && (
                    <div className={styles.bubblePopupProps}>
                      {selectedBubble.type !== "line" && selectedBubble.type !== "arrow" && (
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>채움</span>
                          {["transparent", "#ffffff", "#000000", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ec4899"].map((color) => (
                            <button
                              key={color}
                              className={`${styles.bubbleColorBtn} ${selectedBubble.fillColor === color ? styles.bubbleColorActive : ""}`}
                              style={{ background: color === "transparent" ? "linear-gradient(45deg, #999 25%, transparent 25%, transparent 75%, #999 75%), linear-gradient(45deg, #999 25%, transparent 25%, transparent 75%, #999 75%)" : color, backgroundSize: "6px 6px", backgroundPosition: "0 0, 3px 3px" }}
                              onClick={() => updateBubble(selectedBubble.id, { fillColor: color })}
                              title={color === "transparent" ? "투명" : color}
                            />
                          ))}
                        </div>
                      )}
                      <div className={styles.bubblePopupRow}>
                        <span className={styles.bubblePopupLabel}>선색</span>
                        {["#000000", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#6b7280"].map((color) => (
                          <button
                            key={color}
                            className={`${styles.bubbleColorBtn} ${selectedBubble.strokeColor === color ? styles.bubbleColorActive : ""}`}
                            style={{ background: color }}
                            onClick={() => updateBubble(selectedBubble.id, { strokeColor: color })}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className={styles.bubblePopupRow}>
                        <span className={styles.bubblePopupLabel}>두께</span>
                        <input type="range" min={1} max={16} value={selectedBubble.strokeWidth} onChange={(event) => updateBubble(selectedBubble.id, { strokeWidth: Number(event.target.value) })} />
                      </div>
                      <div className={styles.bubblePopupRow}>
                        <span className={styles.bubblePopupLabel}>선</span>
                        <select value={selectedBubble.strokeStyle || "solid"} onChange={(event) => updateBubble(selectedBubble.id, { strokeStyle: event.target.value as SpeechBubble["strokeStyle"] })}>
                          <option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option><option value="rough">손그림</option>
                        </select>
                      </div>
                      {selectedBubble.type === "roundedRectangle" && (
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>모서리</span>
                          <input type="range" min={0} max={Math.round(Math.min(selectedBubble.width, selectedBubble.height) / 2)} value={selectedBubble.cornerRadius || 0} onChange={(event) => updateBubble(selectedBubble.id, { cornerRadius: Number(event.target.value) })} />
                        </div>
                      )}
                      {selectedBubble.type !== "line" && selectedBubble.type !== "arrow" && (
                        <div className={styles.bubblePopupRow}>
                          <label className={styles.toggleCompact}><input type="checkbox" checked={Boolean(selectedBubble.gradientColor)} onChange={(event) => updateBubble(selectedBubble.id, { gradientColor: event.target.checked ? "#bfdbfe" : undefined })} /> 그라데이션</label>
                          {selectedBubble.gradientColor && <input type="color" value={selectedBubble.gradientColor} onChange={(event) => updateBubble(selectedBubble.id, { gradientColor: event.target.value })} />}
                        </div>
                      )}
                      <div className={styles.bubblePopupRow}>
                        <span className={styles.bubblePopupLabel}>투명도</span>
                        <input type="range" min={0} max={100} value={Math.round(selectedBubble.opacity * 100)} onChange={(event) => updateBubble(selectedBubble.id, { opacity: Number(event.target.value) / 100 })} />
                      </div>
                      <div className={styles.bubblePopupRow}>
                        <span className={styles.bubblePopupLabel}>각도</span>
                        <input type="range" min={-180} max={180} value={Math.round(selectedBubble.rotation ?? 0)} onChange={(event) => updateBubble(selectedBubble.id, { rotation: Number(event.target.value) })} />
                        <span>{Math.round(selectedBubble.rotation ?? 0)}°</span>
                      </div>
                      <button className={styles.bubbleDeleteBtn} onClick={() => deleteBubble(selectedBubble.id)}><LuTrash2 size={12} /> 삭제</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button
                className={`${styles.toolBtn} ${layoutPickerOpen ? styles.toolActive : ""}`}
                onClick={() => setLayoutPickerOpen((open) => !open)}
                title="패널 레이아웃"
              >
                <LuLayoutTemplate size={16} /> 레이아웃
              </button>
              {layoutPickerOpen && (
                <div className={`${styles.bubblePopup} ${styles.layoutPopup}`}>
                  <button onClick={() => addPanelLayout("single")} title="1칸"><LuSquare size={18} /></button>
                  <button onClick={() => addPanelLayout("columns")} title="좌우 2칸"><LuColumns2 size={18} /></button>
                  <button onClick={() => addPanelLayout("rows")} title="상하 2칸"><LuRows2 size={18} /></button>
                  <button onClick={() => addPanelLayout("three")} title="상단 1칸, 하단 2칸"><LuPanelTop size={18} /></button>
                  <button onClick={() => addPanelLayout("twoOne")} title="상단 2칸, 하단 1칸"><LuPanelsTopLeft size={18} /></button>
                  <button onClick={() => addPanelLayout("four")} title="2×2 4칸"><LuGrid2X2 size={18} /></button>
                  <button onClick={() => addPanelLayout("threeColumns")} title="세로 3칸"><LuColumns3 size={18} /></button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* 우측: 레이어 패널 */}
        <div className={`${styles.layerPanel} ${layerPanelCollapsed ? styles.layerPanelCollapsed : ""} ${layerPanelSide === "left" ? styles.layerPanelLeft : ""}`}>
          <div className={styles.layerPanelHeader}>
            {!layerPanelCollapsed && <h3 className={styles.layerTitle}>레이어</h3>}
            <div>
              {!layerPanelCollapsed && (
                <>
                  <button onClick={duplicateLayer} disabled={!activeLayer} title="레이어 복제"><LuCopy size={13} /></button>
                  <button onClick={groupSelectedLayers} disabled={selectedLayerIds.length < 2} title="선택 레이어 그룹"><LuGroup size={13} /></button>
                  <button
                    onClick={ungroupSelectedLayers}
                    disabled={!layers.some((layer) => selectedLayerIds.includes(layer.id) && layer.groupId)}
                    title="선택 그룹 해제"
                  ><LuUngroup size={13} /></button>
                  <button
                    onClick={() => setLayerPanelSide((value) => value === "right" ? "left" : "right")}
                    title={layerPanelSide === "right" ? "레이어 패널을 왼쪽으로 옮기기" : "레이어 패널을 오른쪽으로 옮기기"}
                  ><LuPanelLeft size={13} /></button>
                </>
              )}
              <button
                className={styles.collapseButton}
                onClick={() => setLayerPanelCollapsed((value) => !value)}
                title={layerPanelCollapsed ? "레이어 패널 열기" : "레이어 패널 접기"}
              >{layerPanelCollapsed ? <LuPanelRightOpen size={14} /> : <LuPanelRightClose size={14} />}</button>
            </div>
          </div>
          <div className={styles.layerList}>
            {[...layers].reverse().map((layer, ri) => (
              <div key={layer.id}>
                <button
                  className={styles.layerAddBtn}
                  onClick={() => {
                    setActiveLayerId(layer.id);
                    addLayer("above");
                  }}
                  title="위에 레이어 추가"
                >
                  <LuPlus size={10} />
                </button>
                <div
                  className={`${styles.layerItem} ${activeLayerId === layer.id ? styles.layerActive : ""} ${layer.groupId ? styles.layerGrouped : ""} ${layerDropTargetId === layer.id ? styles.layerDropTarget : ""}`}
                  onClick={() => setActiveLayerId(layer.id)}
                  onDragEnter={(event) => {
                    if (event.dataTransfer.types.includes("application/x-canvas-layer")) setLayerDropTargetId(layer.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId = e.dataTransfer.getData("application/x-canvas-layer");
                    if (sourceId) {
                      reorderLayer(sourceId, layer.id);
                      return;
                    }
                    const url = e.dataTransfer.getData("text/plain");
                    if (url) handleDropOnLayer(layer.id, url);
                    setLayerDropTargetId(null);
                  }}
                >
                  <button
                    type="button"
                    className={styles.layerDragHandle}
                    draggable
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-canvas-layer", layer.id);
                      setLayerDropTargetId(null);
                    }}
                    onDragEnd={() => setLayerDropTargetId(null)}
                    title="드래그해 레이어 순서 변경"
                    aria-label={`${layer.name || "레이어"} 순서 변경`}
                  ><LuGripVertical size={12} /></button>
                  <input
                    className={styles.layerSelect}
                    type="checkbox"
                    checked={selectedLayerIds.includes(layer.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => setSelectedLayerIds((current) =>
                      current.includes(layer.id)
                        ? current.filter((id) => id !== layer.id)
                        : [...current, layer.id]
                    )}
                    aria-label={`${layer.name || "레이어"} 그룹 선택`}
                  />
                  {/* 선택된 레이어: 순서 이동 화살표 */}
                  {activeLayerId === layer.id ? (
                    <div className={styles.layerArrows}>
                      {ri > 0 && (
                        <button
                          className={styles.layerArrowBtn}
                          onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "up"); }}
                          title="위로"
                        >
                          <LuChevronUp size={12} />
                        </button>
                      )}
                      {ri < layers.length - 1 && (
                        <button
                          className={styles.layerArrowBtn}
                          onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "down"); }}
                          title="아래로"
                        >
                          <LuChevronDown size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className={styles.layerArrows} />
                  )}

                  {/* 보기/안보기 */}
                  <button
                    className={styles.layerVisBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      saveUndo();
                      setLayers((prev) => prev.map((l) => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                    }}
                    title={layer.visible ? "숨기기" : "보이기"}
                  >
                    {layer.visible ? <LuEye size={12} /> : <LuEyeOff size={12} />}
                  </button>

                  <button
                    className={styles.layerVisBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      saveUndo();
                      setLayers((prev) => prev.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item));
                    }}
                    title={layer.locked ? "잠금 해제" : "레이어 잠금"}
                  >
                    {layer.locked ? <LuLock size={12} /> : <LuLockOpen size={12} />}
                  </button>

                  <div className={styles.layerThumb}>
                    {layer.fillColor && !layer.imageUrl ? (
                      <div style={{ width: "100%", height: "100%", background: layer.fillColor }} />
                    ) : layer.imageUrl ? (
                      <img src={layer.imageUrl} alt="" />
                    ) : (
                      <span className={styles.layerEmpty}>빈</span>
                    )}
                  </div>

                  <div className={styles.layerInfo}>
                    <input
                      className={styles.layerName}
                      value={layer.name || `Layer ${layers.length - ri}`}
                      maxLength={40}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setDirty(true);
                        setLayers((prev) => prev.map((item) => item.id === layer.id ? { ...item, name: e.target.value } : item));
                      }}
                    />
                    {layer.clipToBelow && <span className={styles.layerHint}>아래 레이어에 클리핑</span>}
                    {!layer.imageUrl && !layer.canvas && !layer.fillColor && (
                      <span className={styles.layerHint}>드래그&드롭으로 이미지를 추가하세요</span>
                    )}
                  </div>

                  {/* 빈 레이어: 색칠 버튼 */}
                  {!layer.imageUrl && !layer.canvas && (
                    <div className={styles.layerColorPicker}>
                      <LuPaintBucket size={10} />
                    </div>
                  )}

                  {layers.length > 1 && (
                    <button
                      className={styles.layerDeleteBtn}
                      onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                    >
                      <LuTrash2 size={12} />
                    </button>
                  )}
                </div>

                {/* 빈 레이어 색상 선택 (활성 + 빈 레이어일 때) */}
                {activeLayerId === layer.id && !layer.imageUrl && !layer.canvas && (
                  <div className={styles.colorSwatches}>
                    {FILL_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`${styles.colorSwatch} ${layer.fillColor === color ? styles.colorSwatchActive : ""}`}
                        style={{ background: color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          saveUndo();
                          setLayers((prev) => prev.map((l) =>
                            l.id === layer.id ? { ...l, fillColor: l.fillColor === color ? null : color } : l
                          ));
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button
              className={styles.layerAddBtn}
              onClick={() => addLayer("below")}
              title="맨 아래 레이어 추가"
            >
              <LuPlus size={10} />
            </button>
          </div>

          <button
            className={styles.saveBtn}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            <LuSave size={16} />
            {saving
              ? "저장 중..."
              : `저장하기 (${ASPECT_CONFIG[aspect].exportW}×${ASPECT_CONFIG[aspect].exportH})`}
          </button>
          <button className={styles.doneBtn} onClick={closeEditor}><LuCheck size={15} /> 편집 완료</button>
        </div>

        {/* 우측 끝: 갤러리 이미지 리스트 */}
        <div className={`${styles.imageList} ${assetPanelCollapsed ? styles.imageListCollapsed : ""}`}>
          <div className={styles.assetPanelHeader}>
            {!assetPanelCollapsed && <strong>자산</strong>}
            <div className={styles.assetPanelHeaderActions}>
              {!assetPanelCollapsed && (
                <button onClick={() => setAssetReloadVersion((value) => value + 1)} disabled={assetLibraryLoading} title="자산 새로고침">
                  <LuRefreshCw className={assetLibraryLoading ? styles.spin : ""} size={13} />
                </button>
              )}
              <button
                className={styles.collapseButton}
                onClick={() => setAssetPanelCollapsed((value) => !value)}
                title={assetPanelCollapsed ? "자산 패널 열기" : "자산 패널 접기"}
              >{assetPanelCollapsed ? <LuPanelRightOpen size={14} /> : <LuPanelRightClose size={14} />}</button>
            </div>
          </div>
          <div className={styles.assetTabs} aria-label="이미지 자산 종류">
            {([
              ["project", "프로젝트"],
              ["character", "내 캐릭터"],
              ["gesture", "제스처"],
              ["background", "배경"],
            ] as const).map(([id, label]) => (
              <button key={id} className={assetTab === id ? styles.assetTabActive : ""} onClick={() => setAssetTab(id)}>{label}</button>
            ))}
          </div>
          {assetTab === "character" && (
            <select className={styles.assetFilter} value={characterView} onChange={(event) => setCharacterView(event.target.value)} aria-label="캐릭터 포즈 선택">
              <option value="all">전체 포즈</option>
              <option value="front">정면</option>
              <option value="left">좌측</option>
              <option value="right">우측</option>
              <option value="back">후면</option>
            </select>
          )}
          <div className={styles.assetList}>
            {assetLibraryLoading && assetTab !== "project" ? (
              <div className={styles.assetEmpty}><LuLoaderCircle className={styles.spin} /></div>
            ) : displayedAssets.length === 0 ? (
              <div className={styles.assetEmpty}>사용할 이미지가 없습니다.</div>
            ) : displayedAssets.map((img) => (
              <button
                type="button"
                key={img.id}
                className={styles.imageListItem}
                draggable
                onClick={() => void addImageLayer(img.dataUrl, img.label || "이미지 객체")}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", img.dataUrl);
                }}
                title={img.label || "이미지 객체로 추가"}
              >
                <img src={img.thumbnailUrl || img.dataUrl} alt={img.label || ""} />
                {img.label && <span>{img.label}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {watermarkOpen && (
        <div className={styles.presetBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !watermarkApplying) setWatermarkOpen(false);
        }}>
          <section className={styles.presetDialog} role="dialog" aria-modal="true" aria-labelledby="watermark-settings-title">
            <header className={styles.historyHeader}>
              <div><span>WATERMARK</span><h2 id="watermark-settings-title">워터마크 설정</h2></div>
              <button onClick={() => setWatermarkOpen(false)} disabled={watermarkApplying} title="닫기"><LuX size={17} /></button>
            </header>
            <div className={styles.presetBody}>
              <div className={styles.presetPreviewColumn}>
                <div className={styles.watermarkPreview}>
                  <span
                    className={styles[`watermark_${watermarkSettings.position.replace("-", "_")}`]}
                    style={{
                      color: watermarkSettings.textColor,
                      fontFamily: watermarkSettings.fontFamily,
                      fontSize: `${Math.max(11, Math.min(30, watermarkSettings.fontSize * 0.72))}px`,
                      fontWeight: watermarkSettings.fontWeight,
                      WebkitTextStroke: watermarkSettings.outlineWidth > 0
                        ? `${Math.min(3, watermarkSettings.outlineWidth)}px #000000`
                        : undefined,
                    }}
                  >{watermarkSettings.text || "워터마크"}</span>
                </div>
                <div className={styles.positionGrid} aria-label="워터마크 위치">
                  {([
                    ["top-left", "왼쪽 위", LuArrowUpLeft],
                    ["top-right", "오른쪽 위", LuArrowUpRight],
                    ["bottom-left", "왼쪽 아래", LuArrowDownLeft],
                    ["bottom-right", "오른쪽 아래", LuArrowDownRight],
                  ] as const).map(([position, label, Icon]) => (
                    <button
                      type="button"
                      key={position}
                      className={watermarkSettings.position === position ? styles.positionActive : ""}
                      onClick={() => setWatermarkSettings((current) => ({ ...current, position: position as WatermarkPosition }))}
                      aria-label={label}
                      title={label}
                    ><Icon size={17} /></button>
                  ))}
                </div>
              </div>
              <div className={styles.presetFields}>
                <label className={styles.presetFieldWide}><span>텍스트</span><input value={watermarkSettings.text} maxLength={120} onChange={(event) => setWatermarkSettings((current) => ({ ...current, text: event.target.value }))} /></label>
                <label className={styles.presetFieldWide}><span>글꼴</span><select value={watermarkSettings.fontFamily} onChange={(event) => setWatermarkSettings((current) => ({ ...current, fontFamily: event.target.value }))}>{BUBBLE_FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
                <div className={styles.presetFieldWide}>
                  <span>굵기</span>
                  <div className={styles.segmentedControl}>
                    <button type="button" className={watermarkSettings.fontWeight === "normal" ? styles.segmentActive : ""} onClick={() => setWatermarkSettings((current) => ({ ...current, fontWeight: "normal" }))}>보통</button>
                    <button type="button" className={watermarkSettings.fontWeight === "bold" ? styles.segmentActive : ""} onClick={() => setWatermarkSettings((current) => ({ ...current, fontWeight: "bold" }))}>굵게</button>
                  </div>
                </div>
                <label><span>색상</span><input type="color" value={watermarkSettings.textColor} onChange={(event) => setWatermarkSettings((current) => ({ ...current, textColor: event.target.value }))} /></label>
                <label><span>크기</span><input type="number" min={10} max={160} value={watermarkSettings.fontSize} onChange={(event) => setWatermarkSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label>
                <label><span>여백</span><input type="number" min={0} max={320} value={watermarkSettings.margin} onChange={(event) => setWatermarkSettings((current) => ({ ...current, margin: Number(event.target.value) }))} /></label>
                <label><span>외곽선</span><input type="number" min={0} max={16} value={watermarkSettings.outlineWidth} onChange={(event) => setWatermarkSettings((current) => ({ ...current, outlineWidth: Number(event.target.value) }))} /></label>
              </div>
            </div>
            <div className={styles.presetScope}>
              <span>적용 범위</span>
              <div className={styles.segmentedControl}>
                {([["current", "현재 컷"], ["all", "전체 컷"], ["range", "범위"]] as const).map(([scope, label]) => (
                  <button type="button" key={scope} className={watermarkScope === scope ? styles.segmentActive : ""} onClick={() => setWatermarkScope(scope)}>{label}</button>
                ))}
              </div>
              {watermarkScope === "range" && (
                <div className={styles.rangeFields}>
                  <label><span>시작</span><input type="number" min={1} max={Math.max(1, orderedPages.length)} value={watermarkRange.start} onChange={(event) => setWatermarkRange((current) => ({ ...current, start: Math.max(1, Number(event.target.value) || 1) }))} /></label>
                  <label><span>끝</span><input type="number" min={watermarkRange.start} max={Math.max(1, orderedPages.length)} value={watermarkRange.end} onChange={(event) => setWatermarkRange((current) => ({ ...current, end: Math.max(current.start, Number(event.target.value) || current.start) }))} /></label>
                </div>
              )}
            </div>
            <footer className={styles.presetActions}>
              <button className={styles.presetDelete} onClick={() => void deleteWatermarks()} disabled={watermarkApplying}><LuTrash2 size={14} /> 삭제</button>
              <span />
              <button onClick={() => setWatermarkOpen(false)} disabled={watermarkApplying}>취소</button>
              <button className={styles.presetPrimary} onClick={() => void applyWatermarkSettings()} disabled={watermarkApplying || !watermarkSettings.text.trim()}>
                {watermarkApplying ? <LuLoaderCircle className={styles.spin} /> : <LuCheck />} 적용
              </button>
            </footer>
          </section>
        </div>
      )}
      {captionOpen && (
        <div className={styles.presetBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !captionApplying) setCaptionOpen(false);
        }}>
          <section className={`${styles.presetDialog} ${styles.captionDialog}`} role="dialog" aria-modal="true" aria-labelledby="caption-settings-title">
            <header className={styles.historyHeader}>
              <div><span>CAPTION</span><h2 id="caption-settings-title">캡션·내레이션 설정</h2></div>
              <button onClick={() => setCaptionOpen(false)} disabled={captionApplying} title="닫기"><LuX size={17} /></button>
            </header>
            <div className={styles.presetBody}>
              <div className={styles.presetPreviewColumn}>
                <div className={styles.captionPreview} style={{ fontFamily: captionSettings.fontFamily, fontWeight: captionSettings.fontWeight, color: captionSettings.textColor }}>
                  <span style={{ fontSize: `${Math.max(12, Math.min(26, captionSettings.fontSize * 0.48))}px` }}>상단 캡션</span>
                  <span style={{ fontSize: `${Math.max(12, Math.min(26, captionSettings.fontSize * 0.48))}px` }}>하단 캡션</span>
                </div>
                <div className={styles.captionAddButtons}>
                  <button type="button" onClick={() => addCaptionLocally("top")}><LuPanelTop size={15} /> 상단 추가</button>
                  <button type="button" onClick={() => addCaptionLocally("bottom")}><LuPanelBottom size={15} /> 하단 추가</button>
                </div>
              </div>
              <div className={styles.presetFields}>
                <label className={styles.presetFieldWide}><span>글꼴</span><select value={captionSettings.fontFamily} onChange={(event) => setCaptionSettings((current) => ({ ...current, fontFamily: event.target.value }))}>{BUBBLE_FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
                <div className={styles.presetFieldWide}>
                  <span>굵기</span>
                  <div className={styles.segmentedControl}>
                    <button type="button" className={captionSettings.fontWeight === "normal" ? styles.segmentActive : ""} onClick={() => setCaptionSettings((current) => ({ ...current, fontWeight: "normal" }))}>보통</button>
                    <button type="button" className={captionSettings.fontWeight === "bold" ? styles.segmentActive : ""} onClick={() => setCaptionSettings((current) => ({ ...current, fontWeight: "bold" }))}>굵게</button>
                  </div>
                </div>
                <label><span>색상</span><input type="color" value={captionSettings.textColor} onChange={(event) => setCaptionSettings((current) => ({ ...current, textColor: event.target.value }))} /></label>
                <label><span>크기</span><input type="number" min={12} max={180} value={captionSettings.fontSize} onChange={(event) => setCaptionSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label>
                <label className={styles.presetFieldWide}><span>가장자리 여백</span><input type="range" min={0} max={360} value={captionSettings.margin} onChange={(event) => setCaptionSettings((current) => ({ ...current, margin: Number(event.target.value) }))} /><b>{captionSettings.margin}px</b></label>
              </div>
            </div>
            <div className={styles.captionScopeNote}>현재 프로젝트에서 이미 만든 모든 캡션의 서식에 적용됩니다.</div>
            <footer className={styles.presetActions}>
              <span />
              <span />
              <button onClick={() => setCaptionOpen(false)} disabled={captionApplying}>취소</button>
              <button className={styles.presetPrimary} onClick={() => void applyCaptionSettings()} disabled={captionApplying}>
                {captionApplying ? <LuLoaderCircle className={styles.spin} /> : <LuCheck />} 전체 캡션에 적용
              </button>
            </footer>
          </section>
        </div>
      )}
      {historyOpen && (
        <div className={styles.historyBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !restoringVersionId) setHistoryOpen(false);
        }}>
          <section className={styles.historyDialog} role="dialog" aria-modal="true" aria-labelledby="canvas-history-title">
            <header className={styles.historyHeader}>
              <div><span>CANVAS HISTORY</span><h2 id="canvas-history-title">편집 히스토리</h2></div>
              <button onClick={() => setHistoryOpen(false)} disabled={Boolean(restoringVersionId)} title="닫기"><LuX size={17} /></button>
            </header>
            {historySelection.length === 2 && (
              <div className={styles.historyCompare}>
                {historySelection.map((id) => {
                  const version = historyVersions.find((item) => item.id === id);
                  return version ? (
                    <figure key={id}>
                      <img src={version.imageUrl} alt={version.label || "비교 버전"} />
                      <figcaption>{version.label || version.source} · {new Date(version.createdAt).toLocaleString("ko-KR")}</figcaption>
                    </figure>
                  ) : null;
                })}
              </div>
            )}
            <div className={styles.historyToolbar}>
              <span><LuGitCompare size={14} /> 두 버전을 선택하면 나란히 비교합니다.</span>
              <button onClick={() => setHistorySelection([])} disabled={historySelection.length === 0}>선택 해제</button>
            </div>
            <div className={styles.historyList}>
              {historyLoading ? (
                <div className={styles.historyEmpty}><LuLoaderCircle className={styles.spin} /> 불러오는 중</div>
              ) : historyVersions.length === 0 ? (
                <div className={styles.historyEmpty}>아직 저장된 버전이 없습니다. 현재 캔버스를 저장하면 첫 버전이 생성됩니다.</div>
              ) : historyVersions.map((version) => (
                <article key={version.id} className={historySelection.includes(version.id) ? styles.historySelected : ""}>
                  <label>
                    <input
                      type="checkbox"
                      checked={historySelection.includes(version.id)}
                      onChange={() => setHistorySelection((current) => current.includes(version.id)
                        ? current.filter((id) => id !== version.id)
                        : [...current.slice(-1), version.id])}
                    />
                    <img src={version.thumbnailUrl || version.imageUrl} alt="" />
                  </label>
                  <div>
                    <strong>{version.label || (version.source.startsWith("ai") ? "AI 편집" : "캔버스 저장")}</strong>
                    <span>{new Date(version.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <button onClick={() => void restoreVersion(version)} disabled={Boolean(restoringVersionId)}>
                    {restoringVersionId === version.id ? <LuLoaderCircle className={styles.spin} /> : <LuRotateCcw />} 복원
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
