"use client";

import { useState, useCallback } from "react";
import ImageDropZone, { type ImageData } from "./ImageDropZone";
import styles from "./WorkflowCard.module.css";
import {
  buildCleanupPrompt,
  DEFAULT_STYLIZE_PROMPT,
  buildStylizePrompt,
  buildAnglesPrompt,
} from "@/lib/background-prompts";

interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface StepState {
  inputImage: ImageData | null;
  results: GeneratedImage[];
  selectedIndex: number | null;
  generating: boolean;
  error: string | null;
}

const ANGLE_OPTIONS = [
  { label: "줌인", prompt: "줌인" },
  { label: "줌아웃", prompt: "줌아웃" },
  { label: "위", prompt: "위에서 본 모습" },
  { label: "아래", prompt: "아래에서 본 모습" },
  { label: "왼쪽", prompt: "왼쪽에서 본 모습" },
  { label: "오른쪽", prompt: "오른쪽에서 본 모습" },
];

const MUTUAL_EXCLUSION: Record<string, string> = {
  "줌인": "줌아웃",
  "줌아웃": "줌인",
  "위에서 본 모습": "아래에서 본 모습",
  "아래에서 본 모습": "위에서 본 모습",
  "왼쪽에서 본 모습": "오른쪽에서 본 모습",
  "오른쪽에서 본 모습": "왼쪽에서 본 모습",
};

interface WorkflowCardProps {
  id: number;
  onDelete: () => void;
  onPreview: (src: string) => void;
  onSaveBackground: (image: { base64: string; mimeType: string }) => void;
}

function makeDataUrl(img: GeneratedImage) {
  return `data:${img.mimeType};base64,${img.base64}`;
}

export default function WorkflowCard({ id, onDelete, onPreview, onSaveBackground }: WorkflowCardProps) {
  // Step 1 state
  const [step1, setStep1] = useState<StepState>({
    inputImage: null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
  const [cleanupPrompt, setCleanupPrompt] = useState("");
  const [cleanupCount, setCleanupCount] = useState(1);

  // Step 2 state
  const [step2, setStep2] = useState<StepState>({
    inputImage: null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
  const [stylizePrompt, setStylizePrompt] = useState(DEFAULT_STYLIZE_PROMPT);
  const [stylizeCount, setStylizeCount] = useState(1);

  // Step 3 state
  const [step3, setStep3] = useState<StepState>({
    inputImage: null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
  const [anglePrompt, setAnglePrompt] = useState("");
  const [angleCount, setAngleCount] = useState(1);
  const [activeAngles, setActiveAngles] = useState<Set<string>>(new Set());

  // --- State invalidation helpers ---
  const resetStep3 = useCallback(() => {
    setStep3({ inputImage: null, results: [], selectedIndex: null, generating: false, error: null });
    setActiveAngles(new Set());
    setAnglePrompt("");
    setAngleCount(1);
  }, []);

  const resetStep2 = useCallback(() => {
    setStep2({ inputImage: null, results: [], selectedIndex: null, generating: false, error: null });
    setStylizePrompt(DEFAULT_STYLIZE_PROMPT);
    setStylizeCount(1);
    resetStep3();
  }, [resetStep3]);

  // --- Step 1: Upload original ---
  const handleOriginalUpload = (img: ImageData) => {
    setStep1((s) => ({
      ...s,
      inputImage: img,
      results: [],
      selectedIndex: null,
      error: null,
    }));
    resetStep2();
  };

  // --- Step 1: Generate cleanup ---
  const handleCleanup = async () => {
    if (!step1.inputImage) return;
    setStep1((s) => ({ ...s, generating: true, error: null, results: [], selectedIndex: null }));
    resetStep2();

    try {
      const prompt = buildCleanupPrompt(cleanupPrompt);
      const res = await fetch("/api/background-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputImage: { base64: step1.inputImage.base64, mimeType: step1.inputImage.mimeType },
          prompt,
          count: cleanupCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");

      setStep1((s) => ({ ...s, generating: false, results: data.images }));

      // Auto-select first result
      if (data.images.length > 0) {
        selectCleanedImage(0, data.images);
      }
    } catch (err) {
      setStep1((s) => ({
        ...s,
        generating: false,
        error: err instanceof Error ? err.message : "오류 발생",
      }));
    }
  };

  // --- Step 1: Select cleaned result ---
  const selectCleanedImage = (index: number, results?: GeneratedImage[]) => {
    const imgs = results || step1.results;
    const img = imgs[index];
    if (!img) return;
    setStep1((s) => ({ ...s, selectedIndex: index }));
    const preview = makeDataUrl(img);
    setStep2((s) => ({
      ...s,
      inputImage: { base64: img.base64, mimeType: img.mimeType, preview },
      results: [],
      selectedIndex: null,
      error: null,
    }));
    resetStep3();
  };

  // --- Step 2: Direct upload ---
  const handleCleanedUpload = (img: ImageData) => {
    setStep2((s) => ({
      ...s,
      inputImage: img,
      results: [],
      selectedIndex: null,
      error: null,
    }));
    resetStep3();
  };

  // --- Step 2: Generate stylize ---
  const handleStylize = async () => {
    if (!step2.inputImage) return;
    setStep2((s) => ({ ...s, generating: true, error: null, results: [], selectedIndex: null }));
    resetStep3();

    try {
      const prompt = buildStylizePrompt(stylizePrompt);
      const res = await fetch("/api/background-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputImage: { base64: step2.inputImage.base64, mimeType: step2.inputImage.mimeType },
          prompt,
          count: stylizeCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");

      setStep2((s) => ({ ...s, generating: false, results: data.images }));

      if (data.images.length > 0) {
        selectStylizedImage(0, data.images);
      }
    } catch (err) {
      setStep2((s) => ({
        ...s,
        generating: false,
        error: err instanceof Error ? err.message : "오류 발생",
      }));
    }
  };

  // --- Step 2: Select stylized result ---
  const selectStylizedImage = (index: number, results?: GeneratedImage[]) => {
    const imgs = results || step2.results;
    const img = imgs[index];
    if (!img) return;
    setStep2((s) => ({ ...s, selectedIndex: index }));
    const preview = makeDataUrl(img);
    setStep3((s) => ({
      ...s,
      inputImage: { base64: img.base64, mimeType: img.mimeType, preview },
      results: [],
      selectedIndex: null,
      error: null,
    }));
  };

  // --- Step 3: Direct upload ---
  const handleStylizedUpload = (img: ImageData) => {
    setStep3((s) => ({
      ...s,
      inputImage: img,
      results: [],
      selectedIndex: null,
      error: null,
    }));
  };

  // --- Step 3: Toggle angle ---
  const toggleAngle = (prompt: string) => {
    setActiveAngles((prev) => {
      const next = new Set(prev);
      const opposite = MUTUAL_EXCLUSION[prompt];
      if (opposite) next.delete(opposite);
      if (next.has(prompt)) {
        next.delete(prompt);
      } else {
        next.add(prompt);
      }
      return next;
    });
  };

  // --- Step 3: Generate angles ---
  const handleGenerateAngles = async () => {
    if (!step3.inputImage) return;
    const angles = Array.from(activeAngles);
    if (angles.length === 0 && !anglePrompt.trim()) {
      alert("생성할 앵글을 선택하거나 프롬프트를 입력해주세요.");
      return;
    }

    setStep3((s) => ({ ...s, generating: true, error: null, results: [] }));

    try {
      const prompt = buildAnglesPrompt(angles, anglePrompt);
      const res = await fetch("/api/background-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputImage: { base64: step3.inputImage.base64, mimeType: step3.inputImage.mimeType },
          prompt,
          count: angleCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");

      setStep3((s) => ({ ...s, generating: false, results: data.images }));
    } catch (err) {
      setStep3((s) => ({
        ...s,
        generating: false,
        error: err instanceof Error ? err.message : "오류 발생",
      }));
    }
  };

  // --- Render helpers ---
  const renderGallery = (
    step: StepState,
    onSelect?: (index: number) => void,
    namePrefix: string = "image"
  ) => {
    if (step.generating) {
      return (
        <div className={styles.gallery}>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center" }}>
            <div className={`${styles.loader} ${styles.galleryLoader}`} />
          </div>
        </div>
      );
    }

    if (step.error && step.results.length === 0) {
      return (
        <div className={styles.gallery}>
          <div className={styles.galleryError}>{step.error}</div>
        </div>
      );
    }

    if (step.results.length === 0) return null;

    return (
      <div className={styles.gallery}>
        {step.results.map((img, i) => {
          const dataUrl = makeDataUrl(img);
          return (
            <div
              key={i}
              className={`${styles.galleryItem} ${step.selectedIndex === i ? styles.galleryItemSelected : ""}`}
            >
              <img src={dataUrl} alt={`${namePrefix}_${i}`} />
              <div className={styles.galleryOverlay}>
                <button
                  className={`${styles.galleryOverlayBtn} ${styles.previewBtn}`}
                  onClick={(e) => { e.stopPropagation(); onPreview(dataUrl); }}
                >
                  미리보기
                </button>
                {onSelect && (
                  <button
                    className={`${styles.galleryOverlayBtn} ${styles.selectBtn}`}
                    onClick={(e) => { e.stopPropagation(); onSelect(i); }}
                  >
                    선택하기
                  </button>
                )}
                <a
                  href={dataUrl}
                  download={`${namePrefix}_${i}.png`}
                  className={`${styles.galleryOverlayBtn} ${styles.downloadBtn}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  다운로드
                </a>
                <button
                  className={`${styles.galleryOverlayBtn} ${styles.saveBtn}`}
                  onClick={(e) => { e.stopPropagation(); onSaveBackground(img); }}
                >
                  배경 저장
                </button>
              </div>
            </div>
          );
        })}
        {step.error && <div className={styles.galleryError}>{step.error}</div>}
      </div>
    );
  };

  const renderCounter = (
    count: number,
    setCount: (n: number) => void
  ) => (
    <div className={styles.counterGroup}>
      <button
        className={styles.counterBtn}
        onClick={() => setCount(Math.max(1, count - 1))}
        disabled={count <= 1}
      >
        -
      </button>
      <input
        type="number"
        className={styles.counterInput}
        value={count}
        min={1}
        max={5}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) setCount(Math.max(1, Math.min(5, v)));
        }}
      />
      <button
        className={styles.counterBtn}
        onClick={() => setCount(Math.min(5, count + 1))}
        disabled={count >= 5}
      >
        +
      </button>
    </div>
  );

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>배경 #{id}</h2>
        <button className={styles.deleteBtn} onClick={onDelete} title="이 작업 삭제">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className={styles.stepsGrid}>
        {/* Step 1: 배경 정리 */}
        <div className={styles.step}>
          <h3 className={styles.stepTitle}>1. 배경 정리</h3>
          <div className={styles.stepContent}>
            <ImageDropZone
              onImageSelect={handleOriginalUpload}
              currentImage={step1.inputImage?.preview}
              label="원본"
              placeholderText={"원본 이미지 업로드\n(클릭, 드래그, 붙여넣기)"}
            />
            {renderGallery(step1, selectCleanedImage, "cleaned")}
          </div>
          <div className={styles.stepControls}>
            <input
              type="text"
              className={styles.promptInput}
              placeholder="제거할 대상 (예: 사람, 자동차)"
              value={cleanupPrompt}
              onChange={(e) => setCleanupPrompt(e.target.value)}
            />
            <div className={styles.controlRow}>
              {renderCounter(cleanupCount, setCleanupCount)}
              <button
                className={`${styles.actionBtn} ${styles.cleanupBtn}`}
                onClick={handleCleanup}
                disabled={!step1.inputImage || step1.generating}
              >
                {step1.generating ? (
                  <div className={styles.loader} />
                ) : step1.results.length > 0 ? (
                  "배경 다시 정리"
                ) : (
                  "배경 정리하기"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step 2: 일러스트 스타일로 변환 */}
        <div className={styles.step}>
          <h3 className={styles.stepTitle}>2. 일러스트 스타일로 변환</h3>
          <div className={styles.stepContent}>
            <ImageDropZone
              onImageSelect={handleCleanedUpload}
              currentImage={step2.inputImage?.preview}
              label="선택된 배경"
              placeholderText={"정리된 이미지 업로드\n(클릭, 드래그, 붙여넣기)\n또는 위 단계에서 선택"}
            />
            {renderGallery(step2, selectStylizedImage, "stylized")}
          </div>
          <div className={styles.stepControls}>
            <textarea
              className={styles.promptInput}
              rows={3}
              value={stylizePrompt}
              onChange={(e) => setStylizePrompt(e.target.value)}
            />
            <div className={styles.controlRow}>
              {renderCounter(stylizeCount, setStylizeCount)}
              <button
                className={`${styles.actionBtn} ${styles.stylizeBtn}`}
                onClick={handleStylize}
                disabled={!step2.inputImage || step2.generating}
              >
                {step2.generating ? (
                  <div className={styles.loader} />
                ) : step2.results.length > 0 ? (
                  "다시 변환하기"
                ) : (
                  "일러스트로 변환하기"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step 3: 다양한 앵글 생성 */}
        <div className={styles.step}>
          <h3 className={styles.stepTitle}>3. 다양한 앵글 생성</h3>
          <div className={styles.stepContent}>
            <ImageDropZone
              onImageSelect={handleStylizedUpload}
              currentImage={step3.inputImage?.preview}
              label="선택된 일러스트"
              placeholderText={"스타일 변환 이미지 업로드\n(클릭, 드래그, 붙여넣기)\n또는 위 단계에서 선택"}
            />
            {renderGallery(step3, undefined, "angle")}
          </div>
          <div className={styles.stepControls}>
            <textarea
              className={styles.promptInput}
              rows={2}
              placeholder="추가 프롬프트 (예: 밤 배경으로, 비오는 날씨로)"
              value={anglePrompt}
              onChange={(e) => setAnglePrompt(e.target.value)}
            />
            <div className={styles.angleOptions}>
              {ANGLE_OPTIONS.map((opt) => (
                <button
                  key={opt.prompt}
                  className={`${styles.angleOptionBtn} ${activeAngles.has(opt.prompt) ? styles.angleOptionActive : ""}`}
                  onClick={() => toggleAngle(opt.prompt)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className={styles.controlRow}>
              {renderCounter(angleCount, setAngleCount)}
              <button
                className={`${styles.actionBtn} ${styles.angleBtn}`}
                onClick={handleGenerateAngles}
                disabled={!step3.inputImage || step3.generating}
              >
                {step3.generating ? (
                  <div className={styles.loader} />
                ) : (
                  "앵글 생성"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
