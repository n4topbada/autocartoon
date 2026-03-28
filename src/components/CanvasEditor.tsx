"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  LuEye,
  LuEyeOff,
  LuPaintBucket,
} from "react-icons/lu";

interface GalleryImage {
  id: string;
  dataUrl: string;
}

interface Layer {
  id: string;
  image: HTMLImageElement | null;
  imageUrl: string | null;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fillColor: string | null; // 단색 채우기 (빈 레이어용)
  canvas: HTMLCanvasElement | null;
}

const FILL_COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

interface Props {
  initialImage: GalleryImage;
  galleryImages: GalleryImage[];
  onClose: () => void;
  onSave: () => void;
}

const CANVAS_W = 540;
type AspectRatio = "1:1" | "4:5";
const ASPECT_CONFIG = {
  "1:1": { w: 540, h: 540, exportW: 1080, exportH: 1080 },
  "4:5": { w: 540, h: 675, exportW: 1080, exportH: 1350 },
};

function createLayer(id?: string, w = CANVAS_W, h = CANVAS_W): Layer {
  return {
    id: id || `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    image: null,
    imageUrl: null,
    opacity: 1,
    x: 0,
    y: 0,
    width: w,
    height: h,
    visible: true,
    fillColor: null,
    canvas: null,
  };
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

export default function CanvasEditor({ initialImage, galleryImages, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [tool, setTool] = useState<"move" | "crop">("move");
  const [saving, setSaving] = useState(false);
  const [bgThreshold, setBgThreshold] = useState(240);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const canvasW = ASPECT_CONFIG[aspect].w;
  const canvasH = ASPECT_CONFIG[aspect].h;

  // Undo: 이전 레이어 상태 1개 저장
  const undoSnapshot = useRef<Layer[] | null>(null);

  const saveUndo = useCallback(() => {
    // 현재 레이어들의 canvas를 복제하여 저장
    undoSnapshot.current = layers.map((l) => {
      let clonedCanvas: HTMLCanvasElement | null = null;
      if (l.canvas) {
        clonedCanvas = document.createElement("canvas");
        clonedCanvas.width = l.canvas.width;
        clonedCanvas.height = l.canvas.height;
        clonedCanvas.getContext("2d")!.drawImage(l.canvas, 0, 0);
      }
      return { ...l, canvas: clonedCanvas };
    });
  }, [layers]);

  const handleUndo = useCallback(() => {
    if (!undoSnapshot.current) return;
    setLayers(undoSnapshot.current);
    undoSnapshot.current = null;
  }, []);

  // Ctrl+Z / Cmd+Z 키보드 핸들러
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);

  // 드래그 이동
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragLayerStart = useRef({ x: 0, y: 0 });

  // 크롭
  const [cropping, setCropping] = useState(false);
  const cropStart = useRef({ x: 0, y: 0 });
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 초기 이미지 로드
  useEffect(() => {
    (async () => {
      try {
        const img = await loadImage(initialImage.dataUrl);
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

        const layer: Layer = {
          ...createLayer("layer_initial", canvasW, canvasH),
          image: img,
          imageUrl: initialImage.dataUrl,
          canvas: layerCanvas,
          width: canvasW,
          height: canvasH,
        };
        setLayers([layer]);
        setActiveLayerId(layer.id);
      } catch {
        const layer = createLayer("layer_initial", canvasW, canvasH);
        setLayers([layer]);
        setActiveLayerId(layer.id);
      }
    })();
  }, [initialImage.dataUrl]);

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
        ctx.drawImage(layer.canvas, layer.x, layer.y);
      }
      ctx.restore();
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
  }, [layers, cropRect, tool]);

  useEffect(() => {
    render();
  }, [render]);

  // 마우스 이벤트 (이동 / 크롭)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (tool === "move") {
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (!activeLayer) return;
      isDragging.current = true;
      dragStart.current = { x: mx, y: my };
      dragLayerStart.current = { x: activeLayer.x, y: activeLayer.y };
    } else if (tool === "crop") {
      setCropping(true);
      cropStart.current = { x: mx, y: my };
      setCropRect({ x: mx, y: my, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (tool === "move" && isDragging.current) {
      const dx = mx - dragStart.current.x;
      const dy = my - dragStart.current.y;
      setLayers((prev) =>
        prev.map((l) =>
          l.id === activeLayerId
            ? { ...l, x: dragLayerStart.current.x + dx, y: dragLayerStart.current.y + dy }
            : l
        )
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
    isDragging.current = false;
    if (tool === "crop" && cropping && cropRect && cropRect.w > 5 && cropRect.h > 5) {
      applyCrop();
    }
    setCropping(false);
  };

  // 크롭 적용
  const applyCrop = () => {
    if (!cropRect) return;
    saveUndo(); // Undo 저장
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas) return;

    const srcCtx = activeLayer.canvas.getContext("2d")!;
    const imageData = srcCtx.getImageData(
      cropRect.x - activeLayer.x,
      cropRect.y - activeLayer.y,
      cropRect.w,
      cropRect.h
    );

    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvasW;
    newCanvas.height = canvasH;
    const newCtx = newCanvas.getContext("2d")!;
    const cx = (canvasW - cropRect.w) / 2;
    const cy = (canvasH - cropRect.h) / 2;
    newCtx.putImageData(imageData, cx, cy);

    setLayers((prev) =>
      prev.map((l) =>
        l.id === activeLayerId ? { ...l, canvas: newCanvas, x: 0, y: 0 } : l
      )
    );
    setCropRect(null);
  };

  // 배경 제거 (Flood Fill: 가장자리에서 흰색→투명, 캐릭터 내부 보존)
  const handleRemoveBackground = () => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas) return;

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
    setLayers((prev) => [...prev]); // 리렌더 트리거
  };

  // 투명도 조절
  const handleOpacityChange = (value: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === activeLayerId ? { ...l, opacity: value } : l))
    );
  };

  // 비율 변경
  const handleAspectChange = (newAspect: AspectRatio) => {
    if (newAspect === aspect) return;
    saveUndo();
    const newCfg = ASPECT_CONFIG[newAspect];
    const oldH = canvasH;
    const newH = newCfg.h;
    const dy = (newH - oldH) / 2; // 상하 확장/축소 오프셋

    setAspect(newAspect);
    setLayers((prev) =>
      prev.map((l) => {
        if (l.canvas) {
          // 기존 캔버스를 새 크기로 복사 (중앙 유지)
          const newCanvas = document.createElement("canvas");
          newCanvas.width = newCfg.w;
          newCanvas.height = newCfg.h;
          const ctx = newCanvas.getContext("2d")!;
          ctx.drawImage(l.canvas, 0, dy);
          return { ...l, canvas: newCanvas, y: l.y + dy, width: newCfg.w, height: newCfg.h };
        }
        return { ...l, width: newCfg.w, height: newCfg.h };
      })
    );
  };

  // 레이어 추가
  const addLayer = (position: "above" | "below") => {
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

  // 레이어 삭제
  const deleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter((l) => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[0].id);
    }
  };

  // 갤러리 이미지를 레이어에 드롭
  const handleDropOnLayer = async (layerId: string, imageUrl: string) => {
    try {
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
            ? { ...l, image: img, imageUrl, canvas: layerCanvas, x: 0, y: 0 }
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
      const cfg = ASPECT_CONFIG[aspect];
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = cfg.exportW;
      exportCanvas.height = cfg.exportH;
      const ctx = exportCanvas.getContext("2d")!;
      const scaleX = cfg.exportW / canvasW;
      const scaleY = cfg.exportH / canvasH;

      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        if (layer.fillColor && !layer.canvas) {
          ctx.fillStyle = layer.fillColor;
          ctx.fillRect(0, 0, cfg.exportW, cfg.exportH);
        } else if (layer.canvas) {
          ctx.drawImage(layer.canvas, layer.x * scaleX, layer.y * scaleY, cfg.exportW, cfg.exportH);
        }
        ctx.restore();
      }

      const blob = await new Promise<Blob>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b!), "image/png")
      );
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), "")
      );

      const res = await fetch("/api/images/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType: "image/png" }),
      });

      if (res.ok) {
        onSave();
        onClose();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <div className={styles.overlay}>
      {/* 헤더 */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>
          <LuArrowLeft size={18} /> 돌아가기
        </button>
        <span className={styles.title}><LuLayers size={16} /> 캔버스 편집</span>
      </div>

      <div className={styles.body}>

        {/* 중앙: 캔버스 */}
        <div className={styles.canvasArea}>
          <div className={styles.canvasWrapper}>
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

          {/* 하단 툴바 */}
          <div className={styles.toolbar}>
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
                disabled={!undoSnapshot.current}
                title="되돌리기 (Ctrl+Z)"
              >
                <LuUndo2 size={16} /> Undo
              </button>
            </div>
          </div>
        </div>

        {/* 우측: 레이어 패널 */}
        <div className={styles.layerPanel}>
          <h3 className={styles.layerTitle}>레이어</h3>
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
                  className={`${styles.layerItem} ${activeLayerId === layer.id ? styles.layerActive : ""}`}
                  onClick={() => setActiveLayerId(layer.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const url = e.dataTransfer.getData("text/plain");
                    if (url) handleDropOnLayer(layer.id, url);
                  }}
                >
                  {/* 보기/안보기 */}
                  <button
                    className={styles.layerVisBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayers((prev) => prev.map((l) => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                    }}
                    title={layer.visible ? "숨기기" : "보이기"}
                  >
                    {layer.visible ? <LuEye size={12} /> : <LuEyeOff size={12} />}
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
                  <span className={styles.layerName}>L{layers.length - ri}</span>

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
            {saving ? "저장 중..." : `합치고 저장하기 (${ASPECT_CONFIG[aspect].exportW}×${ASPECT_CONFIG[aspect].exportH})`}
          </button>
        </div>

        {/* 우측 끝: 갤러리 이미지 리스트 */}
        <div className={styles.imageList}>
          {galleryImages.map((img) => (
            <div
              key={img.id}
              className={styles.imageListItem}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", img.dataUrl);
              }}
            >
              <img src={img.dataUrl} alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
