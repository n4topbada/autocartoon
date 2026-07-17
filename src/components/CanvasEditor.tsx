"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
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
  LuRotateCw,
  LuFlipHorizontal2,
  LuFlipVertical2,
  LuWandSparkles,
  LuX,
} from "react-icons/lu";
import {
  type SpeechBubble,
  type BubbleType,
  BUBBLE_FONT_FAMILIES,
  createBubble,
  drawBubble,
  drawBubbleSelection,
  hitTestBubble,
} from "@/lib/bubble-draw";
import CreditCostBadge from "@/components/CreditCostBadge";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";

interface GalleryImage {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string | null;
  label?: string;
  view?: string;
}

type AssetLibraryTab = "project" | "character" | "gesture" | "background";

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
  rotation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fillColor: string | null;
  canvas: HTMLCanvasElement | null;
  bubbles: SpeechBubble[];
}

const FILL_COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

export type CanvasAspectRatio = "1:1" | "4:5" | "3:4" | "8:11" | "9:16" | "16:9";

interface Props {
  initialImage: GalleryImage;
  galleryImages: GalleryImage[];
  onClose: () => void;
  onSave: (image: SavedCanvasImage) => void;
  initialAspect?: CanvasAspectRatio;
  projectId?: string;
  cutId?: string;
  initialCanvas?: unknown;
}

interface SerializedCanvasLayer {
  id: string;
  name: string;
  locked: boolean;
  groupId: string | null;
  pixelUrl: string | null;
  opacity: number;
  scale?: number;
  rotation?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fillColor: string | null;
  bubbles: SpeechBubble[];
}

interface SerializedCanvasState {
  version: 1;
  aspect: AspectRatio;
  width: number;
  height: number;
  layers: SerializedCanvasLayer[];
}

const MIN_CANVAS = 540;
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
    rotation: 0,
    x: 0,
    y: 0,
    width: w,
    height: h,
    visible: true,
    fillColor: null,
    canvas: null,
    bubbles: [],
  };
}

function parseSerializedCanvas(value: unknown): SerializedCanvasState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<SerializedCanvasState>;
  if (
    state.version !== 1 ||
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

function layerDrawRect(layer: Layer, canvasW: number, canvasH: number) {
  const scale = Math.max(0.1, Math.min(4, layer.scale || 1));
  const width = canvasW * scale;
  const height = canvasH * scale;
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [tool, setTool] = useState<"move" | "crop" | "pipette" | "bubble" | "text" | "shape" | "brush" | "eraser">("move");
  const [bubbleType, setBubbleType] = useState<BubbleType>("classic");
  const [shapeType, setShapeType] = useState<Extract<BubbleType, "rectangle" | "ellipse" | "line" | "star">>("rectangle");
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const bubbleDragMode = useRef<"none" | "move" | "resize" | "tail">("none");
  const bubbleDragHandle = useRef("");
  const bubbleDragStart = useRef({ x: 0, y: 0 });
  const bubbleOriginal = useRef<Partial<SpeechBubble>>({});
  const [saving, setSaving] = useState(false);
  const [bgThreshold, setBgThreshold] = useState(240);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [canvasW, setCanvasW] = useState(MIN_CANVAS);
  const [canvasH, setCanvasH] = useState(MIN_CANVAS);
  const [brushColor, setBrushColor] = useState("#111111");
  const [brushSize, setBrushSize] = useState(12);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showTransparencyGrid, setShowTransparencyGrid] = useState(true);
  const [showOverflow, setShowOverflow] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [fitScale, setFitScale] = useState(1);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawLoading, setRedrawLoading] = useState(false);
  const [redrawPrompt, setRedrawPrompt] = useState("");
  const [redrawUseRegion, setRedrawUseRegion] = useState(false);
  // AI 영역 지정 모드: 크롭 도구로 사각형을 그리되 파괴적 크롭은 적용하지 않고
  // cropRect만 남겨 재생성 영역으로 재사용한다.
  const [aiRegionMode, setAiRegionMode] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [assetTab, setAssetTab] = useState<AssetLibraryTab>("project");
  const [characterView, setCharacterView] = useState("front");
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const [layerPanelCollapsed, setLayerPanelCollapsed] = useState(false);
  const [assetPanelCollapsed, setAssetPanelCollapsed] = useState(false);
  const [layerPanelSide, setLayerPanelSide] = useState<"left" | "right">("right");
  const [assetLibrary, setAssetLibrary] = useState<Record<Exclude<AssetLibraryTab, "project">, GalleryImage[]>>({
    character: [],
    gesture: [],
    background: [],
  });
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(true);
  const drawing = useRef(false);

  const undoStack = useRef<Layer[][]>([]);
  const redoStack = useRef<Layer[][]>([]);
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
    rerenderHistory((value) => value + 1);
  }, [layers]);

  const handleUndo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(cloneLayers(layersRef.current));
    setLayers(cloneLayers(previous));
    rerenderHistory((value) => value + 1);
  }, []);

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(cloneLayers(layersRef.current));
    setLayers(cloneLayers(next));
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
      return { ...layer, canvas: flipped, rotation: -(layer.rotation || 0) };
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

  // 크롭
  const [cropping, setCropping] = useState(false);
  const cropStart = useRef({ x: 0, y: 0 });
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 초기 이미지 로드
  useEffect(() => {
    (async () => {
      try {
        const persisted = parseSerializedCanvas(initialCanvas);
        if (persisted && persisted.layers.length > 0) {
          const restored = await Promise.all(persisted.layers.map(async (saved) => {
            let image: HTMLImageElement | null = null;
            let layerCanvas: HTMLCanvasElement | null = null;
            if (saved.pixelUrl) {
              image = await loadImage(saved.pixelUrl);
              layerCanvas = document.createElement("canvas");
              layerCanvas.width = persisted.width;
              layerCanvas.height = persisted.height;
              layerCanvas.getContext("2d")!.drawImage(image, 0, 0, persisted.width, persisted.height);
            }
            return {
              ...createLayer(saved.id, persisted.width, persisted.height),
              ...saved,
              scale: typeof saved.scale === "number" ? Math.max(0.1, Math.min(4, saved.scale)) : 1,
              rotation: typeof saved.rotation === "number" ? Math.max(-180, Math.min(180, saved.rotation)) : 0,
              image,
              imageUrl: saved.pixelUrl,
              canvas: layerCanvas,
              bubbles: saved.bubbles.map((bubble) => ({ ...bubble })),
            } satisfies Layer;
          }));
          setCanvasW(persisted.width);
          setCanvasH(persisted.height);
          setAspect(persisted.aspect);
          setLayers(restored);
          setActiveLayerId(restored[restored.length - 1].id);
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
          width: cw,
          height: ch,
        };
        setLayers([layer]);
        setActiveLayerId(layer.id);
      } catch {
        const layer = createLayer("layer_initial", MIN_CANVAS, MIN_CANVAS);
        setLayers([layer]);
        setActiveLayerId(layer.id);
      }
    })();
  }, [initialAspect, initialCanvas, initialImage.dataUrl]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 레이어 아래→위 순서로 합성
    for (const layer of layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (layer.fillColor && !layer.canvas) {
        // 단색 채우기 레이어
        ctx.fillStyle = layer.fillColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else if (layer.canvas) {
        const rect = layerDrawRect(layer, canvasW, canvasH);
        drawLayerCanvas(ctx, layer.canvas, rect, layer.rotation);
      }
      // 말풍선 렌더링
      for (const bubble of layer.bubbles) {
        drawBubble(ctx, bubble);
      }
      ctx.restore();
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
        const handleRadius = Math.max(4, canvasW / 180);
        for (const [x, y] of [
          [bounds.left, bounds.top],
          [bounds.right, bounds.top],
          [bounds.right, bounds.bottom],
          [bounds.left, bounds.bottom],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
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
  }, [activeLayerId, layers, cropRect, tool, canvasH, canvasW, selectedBubbleId, showGuides, showOverflow]);

  useEffect(() => {
    render();
  }, [render]);

  // CSS 스케일 보정된 마우스 좌표
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mx, y: my } = getCanvasCoords(e);

    if (tool === "pipette") {
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
    } else if (tool === "brush" || tool === "eraser") {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (!activeLayer || activeLayer.locked) return;
      saveUndo();
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
          layer.id === activeLayerId ? { ...layer, canvas: nextCanvas, fillColor: null } : layer
        ));
      }
      const ctx = drawingCanvas.getContext("2d")!;
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const point = canvasPointToLayer(activeLayer, canvasW, canvasH, mx, my);
      ctx.moveTo(point.x, point.y);
      drawing.current = true;
    } else if (tool === "move") {
      // 가장 위에 보이는 말풍선부터 선택한다.
      for (const layer of [...layers].reverse()) {
        if (!layer.visible || layer.locked) continue;
        for (const bubble of [...layer.bubbles].reverse()) {
          const hit = hitTestBubble(mx, my, bubble);
          if (hit) {
            saveUndo();
            setActiveLayerId(layer.id);
            setSelectedBubbleId(bubble.id);
            bubbleDragStart.current = { x: mx, y: my };
            bubbleOriginal.current = { ...bubble };
            if (hit === "body") bubbleDragMode.current = "move";
            else if (hit === "tail") bubbleDragMode.current = "tail";
            else { bubbleDragMode.current = "resize"; bubbleDragHandle.current = hit; }
            return;
          }
        }
      }

      // 말풍선이 아니면 실제 불투명 영역이 맞는 최상단 레이어를 선택한다.
      setSelectedBubbleId(null);
      const selectedLayer = [...layers].reverse().find((layer) => {
        if (!layer.visible || layer.locked) return false;
        const bounds = getLayerBounds(layer, canvasW, canvasH);
        return mx >= bounds.left && mx <= bounds.right && my >= bounds.top && my <= bounds.bottom;
      });
      if (!selectedLayer) return;
      setActiveLayerId(selectedLayer.id);
      const movingLayers = selectedLayer.groupId
        ? layers.filter((layer) => layer.groupId === selectedLayer.groupId)
        : [selectedLayer];
      if (movingLayers.some((layer) => layer.locked)) return;
      saveUndo();
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
      if (!activeLayer || activeLayer.locked) return;

      // 선택된 말풍선부터 체크
      for (const bubble of [...activeLayer.bubbles].reverse()) {
        const hit = hitTestBubble(mx, my, bubble);
        if (hit) {
          saveUndo();
          setSelectedBubbleId(bubble.id);
          bubbleDragStart.current = { x: mx, y: my };
          bubbleOriginal.current = { ...bubble };

          if (hit === "body") {
            bubbleDragMode.current = "move";
          } else if (hit === "tail") {
            bubbleDragMode.current = "tail";
          } else {
            bubbleDragMode.current = "resize";
            bubbleDragHandle.current = hit;
          }
          return;
        }
      }

      // 아무것도 안 맞으면 새 말풍선 또는 독립 텍스트 생성
      saveUndo();
      const newBubble = createBubble(
        tool === "text" ? "text" : tool === "shape" ? shapeType : bubbleType,
        mx,
        my
      );
      setLayers((prev) =>
        prev.map((l) =>
          l.id === activeLayerId ? { ...l, bubbles: [...l.bubbles, newBubble] } : l
        )
      );
      setSelectedBubbleId(newBubble.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mx, y: my } = getCanvasCoords(e);

    if ((tool === "brush" || tool === "eraser") && drawing.current) {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (!activeLayer?.canvas) return;
      const ctx = activeLayer.canvas.getContext("2d")!;
      const point = canvasPointToLayer(activeLayer, canvasW, canvasH, mx, my);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      alphaBoundsCache.delete(activeLayer.canvas);
      setLayers((current) => [...current]);
      return;
    }

    // move 도구에서도 말풍선 드래그 처리
    if ((tool === "move" || tool === "bubble" || tool === "text" || tool === "shape") && bubbleDragMode.current !== "none" && selectedBubbleId) {
      const dx = mx - bubbleDragStart.current.x;
      const dy = my - bubbleDragStart.current.y;
      const orig = bubbleOriginal.current;
      setLayers((prev) =>
        prev.map((l) => ({
          ...l,
          bubbles: l.bubbles.map((bb) => {
            if (bb.id !== selectedBubbleId) return bb;
            if (bubbleDragMode.current === "move") {
              return { ...bb, x: (orig.x ?? bb.x) + dx, y: (orig.y ?? bb.y) + dy };
            }
            if (bubbleDragMode.current === "tail") {
              return { ...bb, tailTipX: mx, tailTipY: my };
            }
            if (bubbleDragMode.current === "resize") {
              const h = bubbleDragHandle.current;
              let nw = orig.width ?? bb.width;
              let nh = orig.height ?? bb.height;
              let nx = orig.x ?? bb.x;
              let ny = orig.y ?? bb.y;
              if (h.includes("e")) { nw += dx; nx += dx / 2; }
              if (h.includes("w")) { nw -= dx; nx += dx / 2; }
              if (h.includes("s")) { nh += dy; ny += dy / 2; }
              if (h.includes("n")) { nh -= dy; ny += dy / 2; }
              return { ...bb, width: Math.max(40, nw), height: Math.max(30, nh), x: nx, y: ny };
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

  const handleMouseUp = () => {
    if (drawing.current) {
      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      activeLayer?.canvas?.getContext("2d")?.restore();
      drawing.current = false;
    }
    isDragging.current = false;
    bubbleDragMode.current = "none";
    if (tool === "crop" && cropping && cropRect && cropRect.w > 5 && cropRect.h > 5) {
      // AI 영역 지정 모드에서는 파괴적 크롭을 적용하지 않고 cropRect를 재생성 영역으로 보존한다.
      if (aiRegionMode) {
        setAiRegionMode(false);
        setRedrawUseRegion(true);
      } else {
        applyCrop();
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
        l.id === activeLayerId ? { ...l, canvas: newCanvas, scale: 1, rotation: 0, x: 0, y: 0 } : l
      )
    );
    setCropRect(null);
  };

  // 배경 제거 (Flood Fill: 가장자리에서 흰색→투명, 캐릭터 내부 보존)
  const handleRemoveBackground = () => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas || activeLayer.locked) return;

    saveUndo(); // Undo 저장

    const ctx = activeLayer.canvas.getContext("2d")!;
    const w = activeLayer.canvas.width;
    const h = activeLayer.canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const threshold = bgThreshold;

    // 픽셀이 흰색(±threshold)인지 판별
    const isWhite = (idx: number) => {
      return (
        data[idx] >= threshold &&
        data[idx + 1] >= threshold &&
        data[idx + 2] >= threshold &&
        data[idx + 3] > 0 // 이미 투명인 건 건너뜀
      );
    };

    // BFS Flood Fill: 4방향 가장자리에서 시작
    const visited = new Uint8Array(w * h);
    const queue: number[] = [];

    // 가장자리 픽셀을 시드로
    for (let x = 0; x < w; x++) {
      // 상단 행
      if (isWhite(x * 4)) { queue.push(x); visited[x] = 1; }
      // 하단 행
      const bottomIdx = (h - 1) * w + x;
      if (isWhite(bottomIdx * 4)) { queue.push(bottomIdx); visited[bottomIdx] = 1; }
    }
    for (let y = 1; y < h - 1; y++) {
      // 좌측 열
      const leftIdx = y * w;
      if (isWhite(leftIdx * 4)) { queue.push(leftIdx); visited[leftIdx] = 1; }
      // 우측 열
      const rightIdx = y * w + (w - 1);
      if (isWhite(rightIdx * 4)) { queue.push(rightIdx); visited[rightIdx] = 1; }
    }

    // BFS
    let head = 0;
    while (head < queue.length) {
      const pos = queue[head++];
      const px = pos % w;
      const py = Math.floor(pos / w);

      // 투명화
      data[pos * 4 + 3] = 0;

      // 4방향 이웃
      const neighbors = [
        py > 0 ? pos - w : -1,       // 상
        py < h - 1 ? pos + w : -1,   // 하
        px > 0 ? pos - 1 : -1,       // 좌
        px < w - 1 ? pos + 1 : -1,   // 우
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && isWhite(n * 4)) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    alphaBoundsCache.delete(activeLayer.canvas);
    setLayers((prev) => [...prev]); // 리렌더 트리거
    setBackgroundRemoved(true);
  };

  // 투명도 조절
  const handleOpacityChange = (value: number) => {
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
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        bubbles: l.bubbles.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }))
    );
  };

  // 말풍선 삭제
  const deleteBubble = (id: string) => {
    saveUndo();
    setLayers((prev) =>
      prev.map((l) => ({ ...l, bubbles: l.bubbles.filter((b) => b.id !== id) }))
    );
    setSelectedBubbleId(null);
  };

  // 선택된 말풍선 가져오기
  const selectedBubble = selectedBubbleId
    ? layers.flatMap((l) => l.bubbles).find((b) => b.id === selectedBubbleId) ?? null
    : null;

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

  const duplicateLayer = () => {
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
  };

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

  const addBubblePreset = (kind: "watermark" | "caption" | "sfx") => {
    const bubble = kind === "watermark"
      ? {
          ...createBubble("text", canvasW - 125, canvasH - 38),
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
            width: 220,
            height: 150,
            text: "쾅!",
            fillColor: "#fde047",
            textColor: "#111111",
            fontSize: 40,
            fontWeight: "bold" as const,
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

  const setPageBackground = (color: string) => {
    saveUndo();
    setLayers((current) => {
      const existing = current.find((layer) => layer.name === "페이지 배경" && !layer.canvas);
      if (existing) {
        return current.map((layer) => layer.id === existing.id ? { ...layer, fillColor: color, visible: true } : layer);
      }
      return [{
        ...createLayer(undefined, canvasW, canvasH),
        name: "페이지 배경",
        locked: true,
        fillColor: color,
      }, ...current];
    });
  };

  // 레이어 삭제
  const deleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    saveUndo();
    const newLayers = layers.filter((l) => l.id !== id);
    setLayers(newLayers);
    setSelectedLayerIds((current) => current.filter((item) => item !== id));
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[0].id);
    }
  };

  // 레이어 순서 이동 (layers 배열에서 위=뒤, 아래=앞 — 렌더 순서상 앞이 아래)
  const moveLayer = (id: string, direction: "up" | "down") => {
    saveUndo();
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      // "up" = 배열에서 뒤로 (렌더 순서상 위로)
      // "down" = 배열에서 앞으로 (렌더 순서상 아래로)
      const swapIdx = direction === "up" ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const newLayers = [...prev];
      [newLayers[idx], newLayers[swapIdx]] = [newLayers[swapIdx], newLayers[idx]];
      return newLayers;
    });
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
    for (const layer of layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (layer.fillColor && !layer.canvas) {
        ctx.fillStyle = layer.fillColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else if (layer.canvas) {
        const rect = layerDrawRect(layer, canvasW, canvasH);
        drawLayerCanvas(ctx, layer.canvas, rect, layer.rotation);
      }
      for (const bubble of layer.bubbles) drawBubble(ctx, bubble);
      ctx.restore();
    }
    return composite;
  };

  const extractCanvasText = async () => {
    setOcrOpen(true);
    setOcrLoading(true);
    setEditorMessage(null);
    try {
      const image = createCompositeCanvas().toDataURL("image/jpeg", 0.86);
      const response = await fetch("/api/studio/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: { base64: image.split(",")[1], mimeType: "image/jpeg" } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "글자를 추출하지 못했습니다.");
      setOcrText(typeof data.text === "string" ? data.text : "");
      if (!data.text) setEditorMessage("이미지에서 읽을 수 있는 글자를 찾지 못했습니다.");
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

  const queueAiRedraw = async () => {
    if (!projectId || !cutId) {
      setEditorMessage("프로젝트 컷에서만 AI 다시 그리기를 사용할 수 있습니다.");
      return;
    }
    if (!redrawPrompt.trim()) {
      setEditorMessage("다시 그릴 내용을 입력해주세요.");
      return;
    }
    setRedrawLoading(true);
    setEditorMessage(null);
    try {
      const image = createCompositeCanvas().toDataURL("image/jpeg", 0.86);
      const generationAspect = aspect === "3:4" || aspect === "8:11" ? "4:5" : aspect;
      // 크롭 영역이 지정돼 있으면 그 정규화 좌표를 프롬프트에 넣어, 해당 영역만
      // 수정하고 나머지는 원본과 동일하게 유지하도록 유도한다(가이드 영역 재생성).
      const regionLine =
        redrawUseRegion && cropRect
          ? `수정 영역은 이미지를 0~1로 정규화했을 때 좌상단(${(cropRect.x / canvasW).toFixed(2)}, ${(cropRect.y / canvasH).toFixed(2)})부터 우하단(${((cropRect.x + cropRect.w) / canvasW).toFixed(2)}, ${((cropRect.y + cropRect.h) / canvasH).toFixed(2)})까지의 사각형 안쪽뿐이다. 이 영역 밖은 원본과 픽셀 단위로 동일하게 유지한다.`
          : null;
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
          imageSize: "1K",
          projectId,
          cutId,
          inputImage: { base64: image.split(",")[1], mimeType: "image/jpeg" },
          prompt: [
            "현재 완성 컷을 참고해 같은 캐릭터 정체성, 그림체, 화면 비율을 유지하며 수정한다.",
            ...(regionLine ? [regionLine] : []),
            `수정 요청: ${redrawPrompt.trim()}`,
            "요청하지 않은 인물, 글자, 로고, 워터마크를 추가하지 않는다.",
          ].join("\n"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI 다시 그리기를 시작하지 못했습니다.");
      setRedrawOpen(false);
      setRedrawPrompt("");
      setEditorMessage("AI 다시 그리기를 시작했습니다. 완료되면 작업 알림에 표시됩니다.");
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "AI 다시 그리기를 시작하지 못했습니다.");
    } finally {
      setRedrawLoading(false);
    }
  };

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
            ? { ...l, image: img, imageUrl, canvas: layerCanvas, rotation: 0, x: 0, y: 0 }
            : l
        )
      );
    } catch {
      // ignore
    }
  };

  // 합치고 저장하기 (1080px)
  const handleSave = async () => {
    setSaving(true);
    try {
      const { exportW, exportH } = ASPECT_CONFIG[aspect];
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = exportW;
      exportCanvas.height = exportH;
      const ctx = exportCanvas.getContext("2d")!;
      const scaleX = exportW / canvasW;
      const scaleY = exportH / canvasH;

      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        if (layer.fillColor && !layer.canvas) {
          ctx.fillStyle = layer.fillColor;
          ctx.fillRect(0, 0, exportW, exportH);
        } else if (layer.canvas) {
          const rect = layerDrawRect(layer, canvasW, canvasH);
          drawLayerCanvas(ctx, layer.canvas, {
            x: rect.x * scaleX,
            y: rect.y * scaleY,
            width: rect.width * scaleX,
            height: rect.height * scaleY,
          }, layer.rotation);
        }
        // 말풍선 내보내기
        for (const bubble of layer.bubbles) {
          drawBubble(ctx, {
            ...bubble,
            x: bubble.x * scaleX,
            y: bubble.y * scaleY,
            width: bubble.width * scaleX,
            height: bubble.height * scaleY,
            tailTipX: bubble.tailTipX * scaleX,
            tailTipY: bubble.tailTipY * scaleY,
            tailWidth: bubble.tailWidth * scaleX,
            strokeWidth: bubble.strokeWidth * Math.max(scaleX, scaleY),
            fontSize: (bubble.fontSize ?? 24) * Math.min(scaleX, scaleY),
            // 외곽선·자간도 내보내기 배율에 맞춰 스케일해야 편집 화면과 결과가 일치한다.
            outlineWidth: bubble.outlineWidth ? bubble.outlineWidth * Math.max(scaleX, scaleY) : undefined,
            letterSpacing: bubble.letterSpacing ? bubble.letterSpacing * Math.min(scaleX, scaleY) : undefined,
          });
        }
        ctx.restore();
      }

      const blob = await new Promise<Blob>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b!), "image/png")
      );
      const clientPayload = JSON.stringify({ projectId, cutId });
      const serializedCanvas: SerializedCanvasState | undefined = projectId && cutId
        ? {
            version: 1,
            aspect,
            width: canvasW,
            height: canvasH,
            layers: await Promise.all(layers.map(async (layer, index) => {
              const pixelUrl = layer.canvas
                ? (await upload(
                    `edited/layers/${cutId}-${index}-${Date.now()}.png`,
                    await canvasToBlob(layer.canvas),
                    {
                      access: "public",
                      handleUploadUrl: "/api/images/upload",
                      clientPayload,
                    }
                  )).url
                : null;
              return {
                id: layer.id,
                name: layer.name,
                locked: layer.locked,
                groupId: layer.groupId,
                pixelUrl,
                opacity: layer.opacity,
                scale: layer.scale,
                rotation: layer.rotation,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                visible: layer.visible,
                fillColor: layer.fillColor,
                bubbles: layer.bubbles.map((bubble) => ({ ...bubble })),
              };
            })),
          }
        : undefined;
      const uploaded = await upload(`edited/canvas-${Date.now()}.png`, blob, {
        access: "public",
        handleUploadUrl: "/api/images/upload",
        clientPayload,
        multipart: blob.size > 5 * 1024 * 1024,
      });

      const res = await fetch("/api/images/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: uploaded.url,
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
      onSave(result as SavedCanvasImage);
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "이미지를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const displayScale = fitScale * zoom / 100;
  const pageBackgroundColor = layers.find((layer) => layer.name === "페이지 배경" && !layer.canvas)?.fillColor || "#ffffff";
  const displayedAssets = assetTab === "project"
    ? galleryImages
    : assetTab === "character"
      ? assetLibrary.character.filter((image) => characterView === "all" || image.view === characterView)
      : assetLibrary[assetTab];

  return (
    <div className={styles.overlay}>
      {/* 헤더 */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>
          <LuArrowLeft size={18} /> 돌아가기
        </button>
        {editorMessage && (
          <div className={styles.editorNotice} role="status">
            <span>{editorMessage}</span>
            <button onClick={() => setEditorMessage(null)} title="알림 닫기"><LuX size={13} /></button>
          </div>
        )}
        <span className={styles.title}><LuLayers size={16} /> 캔버스 편집</span>
      </div>

      <div className={styles.body}>

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
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>

          {/* 하단 툴바 */}
          <div className={`${styles.toolbar} ${toolbarCollapsed ? styles.toolbarCollapsed : ""}`}>
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
              <button className={styles.toolBtn} onClick={handleRemoveBackground} title="배경제거">
                <LuEraser size={16} /> 배경제거
              </button>
            </div>
            <div className={styles.toolGroup}>
              <button className={styles.toolBtn} onClick={() => imageInputRef.current?.click()} title="이미지 객체 추가">
                <LuImagePlus size={16} />
              </button>
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
              <button className={`${styles.toolBtn} ${tool === "brush" ? styles.toolActive : ""}`} onClick={() => setTool("brush")} title="펜">
                <LuPencil size={16} />
              </button>
              <button className={`${styles.toolBtn} ${tool === "eraser" ? styles.toolActive : ""}`} onClick={() => setTool("eraser")} title="지우개">
                <LuEraser size={16} />
              </button>
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className={styles.brushColor} title="펜 색상" />
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
              <div className={styles.toolGroup}>
                <label className={styles.opacityLabel}>
                  객체 크기
                  <input
                    type="range"
                    min={25}
                    max={200}
                    value={Math.round(activeLayer.scale * 100)}
                    onPointerDown={saveUndo}
                    onChange={(event) => setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, scale: Number(event.target.value) / 100 } : layer))}
                    className={styles.opacitySlider}
                  />
                  <span className={styles.opacityValue}>{Math.round(activeLayer.scale * 100)}%</span>
                </label>
                <label className={styles.opacityLabel}>
                  회전
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={Math.round(activeLayer.rotation)}
                    onPointerDown={saveUndo}
                    onChange={(event) => setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, rotation: Number(event.target.value) } : layer))}
                    className={styles.opacitySlider}
                  />
                  <span className={styles.opacityValue}>{Math.round(activeLayer.rotation)}°</span>
                </label>
                <button
                  className={styles.toolBtn}
                  onClick={() => {
                    if (activeLayer.rotation === 0) return;
                    saveUndo();
                    setLayers((current) => current.map((layer) => layer.id === activeLayer.id ? { ...layer, rotation: 0 } : layer));
                  }}
                  title="회전 초기화"
                ><LuRotateCw size={16} /></button>
                <button className={styles.toolBtn} onClick={() => flipActiveLayer("h")} disabled={activeLayer.locked} title="좌우 뒤집기"><LuFlipHorizontal2 size={16} /></button>
                <button className={styles.toolBtn} onClick={() => flipActiveLayer("v")} disabled={activeLayer.locked} title="상하 뒤집기"><LuFlipVertical2 size={16} /></button>
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
              <button className={styles.toolBtn} onClick={() => addBubblePreset("watermark")} title="워터마크"><LuStamp size={16} /> 워터마크</button>
              <button className={styles.toolBtn} onClick={() => addBubblePreset("caption")} title="캡션·내레이션"><LuCaptions size={16} /> 캡션</button>
              <button className={styles.toolBtn} onClick={() => addBubblePreset("sfx")} title="효과음"><LuZap size={16} /> 효과음</button>
              <label className={styles.pageBackgroundControl} title="페이지 배경">
                <LuPanelBottom size={16} />
                <input type="color" value={pageBackgroundColor} onChange={(event) => setPageBackground(event.target.value)} aria-label="페이지 배경색" />
              </label>
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button className={`${styles.toolBtn} ${ocrOpen ? styles.toolActive : ""}`} onClick={() => ocrOpen ? setOcrOpen(false) : void extractCanvasText()} disabled={ocrLoading} title="이미지 글자 추출">
                {ocrLoading ? <LuLoaderCircle className={styles.spin} size={16} /> : <LuScanText size={16} />} 텍스트 추출
                <CreditCostBadge credits={AI_CREDIT_COSTS.ocr} />
              </button>
              {ocrOpen && (
                <div className={`${styles.bubblePopup} ${styles.aiToolPopup}`}>
                  <strong>추출한 텍스트</strong>
                  {ocrLoading ? (
                    <div className={styles.aiToolLoading}><LuLoaderCircle className={styles.spin} /> 분석 중</div>
                  ) : (
                    <>
                      <textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} rows={7} placeholder="추출된 글자가 여기에 표시됩니다." />
                      <button className={styles.aiToolAction} onClick={addExtractedText} disabled={!ocrText.trim()}><LuType size={14} /> 텍스트 객체로 추가</button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className={styles.toolGroup} style={{ position: "relative" }}>
              <button className={`${styles.toolBtn} ${redrawOpen ? styles.toolActive : ""}`} onClick={() => setRedrawOpen((value) => !value)} disabled={redrawLoading} title="현재 컷 AI 다시 그리기">
                {redrawLoading ? <LuLoaderCircle className={styles.spin} size={16} /> : <LuWandSparkles size={16} />} AI 다시 그리기
              </button>
              {redrawOpen && (
                <div className={`${styles.bubblePopup} ${styles.aiToolPopup}`}>
                  <strong>수정 요청</strong>
                  <textarea value={redrawPrompt} onChange={(event) => setRedrawPrompt(event.target.value)} rows={5} maxLength={2_000} placeholder="예: 배경은 유지하고 인물 표정을 놀란 표정으로 변경" />
                  <div className={styles.aiPresetRow}>
                    <button
                      type="button"
                      className={styles.aiPresetButton}
                      onClick={() => setRedrawPrompt("모든 말풍선·자막·글자를 제거하고 그 자리를 주변 배경·그림체와 자연스럽게 이어지도록 채운다.")}
                    >글자·말풍선 지우기</button>
                    <button
                      type="button"
                      className={`${styles.aiPresetButton} ${aiRegionMode ? styles.textStyleActive : ""}`}
                      onClick={() => { setTool("crop"); setCropRect(null); setAiRegionMode(true); }}
                    >{aiRegionMode ? "영역을 드래그하세요" : "영역 지정"}</button>
                  </div>
                  {cropRect && !aiRegionMode ? (
                    <label className={styles.aiRegionToggle}>
                      <input type="checkbox" checked={redrawUseRegion} onChange={(event) => setRedrawUseRegion(event.target.checked)} />
                      지정한 영역만 수정
                    </label>
                  ) : (
                    <p className={styles.aiRegionHint}>&lsquo;영역 지정&rsquo;을 눌러 드래그하면 그 부분만 수정할 수 있습니다.</p>
                  )}
                  <button className={styles.aiToolAction} onClick={() => void queueAiRedraw()} disabled={redrawLoading || !redrawPrompt.trim()}>
                    {redrawLoading ? <LuLoaderCircle className={styles.spin} /> : <LuWandSparkles />} 작업 시작
                    <CreditCostBadge credits={AI_CREDIT_COSTS.image1k} />
                  </button>
                </div>
              )}
            </div>
            <div className={styles.toolGroup}>
              <label className={styles.opacityLabel}>
                민감도
                <input
                  type="range"
                  min={200}
                  max={255}
                  value={bgThreshold}
                  onChange={(e) => setBgThreshold(Number(e.target.value))}
                  className={styles.opacitySlider}
                />
                <span className={styles.opacityValue}>{bgThreshold}</span>
              </label>
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
                  {/* 선택된 말풍선 속성 */}
                  {selectedBubble && (
                    <>
                      <div className={styles.bubblePopupDivider} />
                      <div className={styles.bubblePopupProps}>
                        <textarea
                          className={styles.bubbleTextInput}
                          value={selectedBubble.text ?? ""}
                          rows={3}
                          placeholder="대사 입력"
                          onChange={(e) => updateBubble(selectedBubble.id, { text: e.target.value })}
                        />
                        <div className={styles.bubblePopupRow}>
                          <span className={styles.bubblePopupLabel}>글자</span>
                          <input
                            type="color"
                            value={selectedBubble.textColor ?? "#111111"}
                            onChange={(e) => updateBubble(selectedBubble.id, { textColor: e.target.value })}
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
                            onClick={() => updateBubble(selectedBubble.id, { fontWeight: selectedBubble.fontWeight === "bold" ? "normal" : "bold" })}
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
                            onClick={() => updateBubble(selectedBubble.id, { fontItalic: !selectedBubble.fontItalic })}
                            title="기울임"
                            style={{ fontStyle: "italic" }}
                          >I</button>
                          <button
                            className={`${styles.textStyleButton} ${selectedBubble.underline ? styles.textStyleActive : ""}`}
                            onClick={() => updateBubble(selectedBubble.id, { underline: !selectedBubble.underline })}
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
                    onChange={(e) => updateBubble(selectedBubble.id, { text: e.target.value })}
                  />
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>글자</span>
                    <input type="color" value={selectedBubble.textColor ?? "#111111"} onChange={(e) => updateBubble(selectedBubble.id, { textColor: e.target.value })} />
                    <input type="number" min={8} max={96} value={selectedBubble.fontSize ?? 24} onChange={(e) => updateBubble(selectedBubble.id, { fontSize: Number(e.target.value) })} className={styles.fontSizeInput} />
                    <button className={`${styles.textStyleButton} ${selectedBubble.fontWeight === "bold" ? styles.textStyleActive : ""}`} onClick={() => updateBubble(selectedBubble.id, { fontWeight: selectedBubble.fontWeight === "bold" ? "normal" : "bold" })}>B</button>
                  </div>
                  <div className={styles.bubblePopupRow}>
                    <span className={styles.bubblePopupLabel}>정렬</span>
                    {(["left", "center", "right"] as const).map((align) => (
                      <button key={align} className={`${styles.textAlignButton} ${(selectedBubble.textAlign ?? "center") === align ? styles.textStyleActive : ""}`} onClick={() => updateBubble(selectedBubble.id, { textAlign: align })}>
                        {align === "left" ? "좌" : align === "right" ? "우" : "중"}
                      </button>
                    ))}
                  </div>
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
                      ["ellipse", "타원", LuCircle],
                      ["line", "선", LuMinus],
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
                  {selectedBubble && ["rectangle", "ellipse", "line", "star"].includes(selectedBubble.type) && (
                    <div className={styles.bubblePopupProps}>
                      {selectedBubble.type !== "line" && (
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
                        <span className={styles.bubblePopupLabel}>투명도</span>
                        <input type="range" min={0} max={100} value={Math.round(selectedBubble.opacity * 100)} onChange={(event) => updateBubble(selectedBubble.id, { opacity: Number(event.target.value) / 100 })} />
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
                  className={`${styles.layerItem} ${activeLayerId === layer.id ? styles.layerActive : ""} ${layer.groupId ? styles.layerGrouped : ""}`}
                  onClick={() => setActiveLayerId(layer.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const url = e.dataTransfer.getData("text/plain");
                    if (url) handleDropOnLayer(layer.id, url);
                  }}
                >
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
                      onChange={(e) => setLayers((prev) => prev.map((item) => item.id === layer.id ? { ...item, name: e.target.value } : item))}
                    />
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
            onClick={handleSave}
            disabled={saving}
          >
            <LuSave size={16} />
            {saving
              ? "저장 중..."
              : `합치고 저장하기 (${ASPECT_CONFIG[aspect].exportW}×${ASPECT_CONFIG[aspect].exportH})`}
          </button>
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
    </div>
  );
}
