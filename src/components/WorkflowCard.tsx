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
import { getGenerationCreditCost } from "@/lib/credit-products";
import CreditCostBadge from "@/components/CreditCostBadge";
import { LuSparkles, LuTrash2 } from "react-icons/lu";

interface GeneratedImage {
  base64?: string;
  artifactId?: string;
  url?: string;
  mimeType: string;
}

interface StepState {
  inputImage: ImageData | null;
  results: GeneratedImage[];
  selectedIndex: number | null;
  generating: boolean;
  error: string | null;
  progress?: number;
  stage?: string;
}

const ANGLE_OPTIONS = [
  { label: "정면", prompt: "눈높이에서 정면으로, 자연스러운 대화와 일상 장면 구도" },
  { label: "3/4 사선", prompt: "비스듬한 45도 옆에서 바라본 구도" },
  { label: "측면", prompt: "바로 옆 90도에서 바라본 측면 구도" },
  { label: "로우 앵글", prompt: "아래에서 위로 올려다보는 로우 앵글" },
  { label: "하이 앵글", prompt: "위에서 아래로 내려다보는 하이 앵글" },
  { label: "조감도", prompt: "머리 바로 위에서 수직으로 내려다보는 조감도" },
  { label: "오버 숄더", prompt: "전경의 어깨 너머로 공간을 바라보는 오버 숄더 구도" },
  { label: "더치 앵글", prompt: "카메라를 살짝 기울인 더치 앵글" },
  { label: "클로즈업", prompt: "공간의 핵심 요소가 화면을 크게 채우는 클로즈업" },
  { label: "익스트림 클로즈", prompt: "공간의 핵심 디테일에 바짝 다가간 익스트림 클로즈업" },
  { label: "와이드", prompt: "넓은 공간이 보이는 와이드 구도" },
  { label: "줌아웃", prompt: "한 발짝 멀리 물러나 공간 전체를 보여주는 줌아웃" },
  { label: "왼쪽", prompt: "같은 공간을 왼쪽에서 바라본 구도" },
  { label: "오른쪽", prompt: "같은 공간을 오른쪽에서 바라본 구도" },
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
  initialImage?: ImageData;
  onDelete: () => void;
  onPreview: (src: string) => void;
  onSaveBackground: (image: GeneratedImage) => void;
  onJobComplete: () => void;
}

interface BackgroundJobArtifact {
  id: string;
  blobUrl: string;
  mimeType: string;
}

interface BackgroundJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  stage: string;
  progress: number;
  error?: string | null;
  artifacts: BackgroundJobArtifact[];
}

const JOB_STAGE_LABELS: Record<string, string> = {
  queued: "생성 대기열 등록",
  preparing_references: "참고 이미지 준비",
  generating_image: "AI 배경 생성",
  saving_artifacts: "결과 저장",
  completed: "완료",
};

function makeDataUrl(img: GeneratedImage) {
  return img.url || `data:${img.mimeType};base64,${img.base64 || ""}`;
}

async function safeFetchJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.length > 100 ? text.slice(0, 100) + "..." : text || "서버 응답 오류");
  }
}

function artifactToGeneratedImage(artifact: BackgroundJobArtifact): GeneratedImage {
  return {
    artifactId: artifact.id,
    url: artifact.blobUrl,
    mimeType: artifact.mimeType,
  };
}

async function runBackgroundJob(args: {
  inputImage?: ImageData;
  inputImages?: ImageData[];
  prompt: string;
  count: number;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  imageSize: "1K" | "2K";
  onProgress: (progress: number, stage: string) => void;
}) {
  const inputImages = args.inputImages?.filter(Boolean) || [];
  if (inputImages.some((image) => !image.base64)) {
    throw new Error("참고 이미지를 다시 업로드해주세요.");
  }
  const mode = inputImages.length > 0 ? "transform" : args.inputImage ? "edit" : "text";
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      presetIds: [],
      jobKind: "background",
      mode,
      prompt: args.prompt,
      count: args.count,
      aspectRatio: args.aspectRatio,
      imageSize: args.imageSize,
      ...(args.inputImage?.artifactId
        ? { sourceArtifactId: args.inputImage.artifactId }
        : args.inputImage?.base64
          ? { inputImage: { base64: args.inputImage.base64, mimeType: args.inputImage.mimeType } }
          : {}),
      ...(inputImages.length > 0
        ? { inputImages: inputImages.map((image) => ({ base64: image.base64, mimeType: image.mimeType })) }
        : {}),
    }),
  });
  const started = await safeFetchJson(response) as { job?: BackgroundJob; error?: string };
  if (!response.ok || !started.job) throw new Error(started.error || "배경 작업을 시작하지 못했습니다.");

  let job = started.job;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    args.onProgress(job.progress, JOB_STAGE_LABELS[job.stage] || "배경을 만들고 있습니다.");
    if (job.status === "succeeded") {
      const artifacts = job.artifacts.filter((artifact) => artifact.mimeType.startsWith("image/"));
      if (artifacts.length === 0) throw new Error("완료된 작업에 이미지가 없습니다.");
      return artifacts.map(artifactToGeneratedImage);
    }
    if (job.status === "failed" || job.status === "canceled") {
      throw new Error(job.error || "배경 생성에 실패했습니다.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2_500));
    const statusResponse = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    const statusData = await safeFetchJson(statusResponse) as { job?: BackgroundJob; error?: string };
    if (!statusResponse.ok || !statusData.job) throw new Error(statusData.error || "작업 상태를 확인하지 못했습니다.");
    job = statusData.job;
  }
  throw new Error("생성이 오래 걸리고 있습니다. 작업은 서버에서 계속 진행되며 완료 알림으로 알려드립니다.");
}

export default function WorkflowCard({ id, initialImage, onDelete, onPreview, onSaveBackground, onJobComplete }: WorkflowCardProps) {
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16" | "16:9">("1:1");
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const [quickSource, setQuickSource] = useState<ImageData | null>(null);
  const [quickStyle, setQuickStyle] = useState<ImageData | null>(null);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [quickAngle, setQuickAngle] = useState(ANGLE_OPTIONS[0].prompt);
  const [quickCount, setQuickCount] = useState(1);
  const [quickStep, setQuickStep] = useState<StepState>({
    inputImage: null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
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
    inputImage: initialImage ?? null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
  const [stylizePrompt, setStylizePrompt] = useState(DEFAULT_STYLIZE_PROMPT);
  const [stylizeCount, setStylizeCount] = useState(1);

  // Step 3 state
  const [step3, setStep3] = useState<StepState>({
    inputImage: initialImage ?? null,
    results: [],
    selectedIndex: null,
    generating: false,
    error: null,
  });
  const [anglePrompt, setAnglePrompt] = useState("");
  const [angleCount, setAngleCount] = useState(1);
  const [activeAngles, setActiveAngles] = useState<Set<string>>(new Set());

  const handleQuickGenerate = async () => {
    const description = quickPrompt.trim();
    if (!description && !quickSource && !quickStyle) return;

    setQuickStep((state) => ({
      ...state,
      generating: true,
      error: null,
      results: [],
      progress: 0,
      stage: "작업 등록 중",
    }));

    const referenceGuide = quickSource && quickStyle
      ? "첨부 1번은 공간과 구도의 원본 사진이고, 첨부 2번은 색감·선·채색만 참고할 목표 그림체다. 원본의 구조를 목표 그림체로 변환한다."
      : quickSource
        ? "첨부 이미지는 공간과 구도의 원본이다. 핵심 구조를 유지해 웹툰 배경으로 변환한다."
        : quickStyle
          ? "첨부 이미지는 목표 그림체 참고다. 장면 내용은 요청문을 따르고 색감·선·채색 방식만 참고한다."
          : "첨부 이미지 없이 요청문만으로 새 배경을 구성한다.";
    const prompt = [
      "웹툰 캐릭터 합성용 배경 이미지를 제작한다.",
      `장면 요청: ${description || "첨부 원본의 공간 구성을 유지한 웹툰 배경"}`,
      `카메라: ${quickAngle}`,
      referenceGuide,
      "배경의 시각적 밀도를 매우 낮게 유지하고, 큰 형태와 넓은 여백을 중심으로 단순하게 구성한다.",
      "작은 소품, 반복 무늬, 복잡한 질감, 불필요한 장식과 시각적 잡음을 최소화한다.",
      "인물, 글자, 숫자, 표지판 문구, 로고, 워터마크, UI, 말풍선을 넣지 않는다.",
    ].join("\n");

    try {
      const images = await runBackgroundJob({
        inputImages: [quickSource, quickStyle].filter((image): image is ImageData => Boolean(image)),
        prompt,
        count: quickCount,
        aspectRatio,
        imageSize,
        onProgress: (progress, stage) => setQuickStep((state) => ({ ...state, progress, stage })),
      });
      setQuickStep((state) => ({
        ...state,
        generating: false,
        results: images,
        progress: 100,
        stage: "완료",
        error: images.length < quickCount ? `${quickCount - images.length}개 결과는 생성되지 않았습니다.` : null,
      }));
      onJobComplete();
    } catch (error) {
      setQuickStep((state) => ({
        ...state,
        generating: false,
        error: error instanceof Error ? error.message : "오류 발생",
      }));
    }
  };

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
    setStep1((s) => ({ ...s, generating: true, error: null, results: [], selectedIndex: null, progress: 0, stage: "작업 등록 중" }));
    resetStep2();

    try {
      const prompt = buildCleanupPrompt(cleanupPrompt);
      const images = await runBackgroundJob({
        inputImage: step1.inputImage,
        prompt,
        count: cleanupCount,
        aspectRatio,
        imageSize,
        onProgress: (progress, stage) => setStep1((state) => ({ ...state, progress, stage })),
      });
      setStep1((s) => ({
        ...s,
        generating: false,
        results: images,
        progress: 100,
        stage: "완료",
        error: images.length < cleanupCount ? `${cleanupCount - images.length}개 결과는 생성되지 않았습니다.` : null,
      }));

      // Auto-select first result
      if (images.length > 0) {
        selectCleanedImage(0, images);
      }
      onJobComplete();
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
      inputImage: { base64: img.base64, artifactId: img.artifactId, mimeType: img.mimeType, preview },
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
    setStep2((s) => ({ ...s, generating: true, error: null, results: [], selectedIndex: null, progress: 0, stage: "작업 등록 중" }));
    resetStep3();

    try {
      const prompt = buildStylizePrompt(stylizePrompt);
      const images = await runBackgroundJob({
        inputImage: step2.inputImage,
        prompt,
        count: stylizeCount,
        aspectRatio,
        imageSize,
        onProgress: (progress, stage) => setStep2((state) => ({ ...state, progress, stage })),
      });
      setStep2((s) => ({
        ...s,
        generating: false,
        results: images,
        progress: 100,
        stage: "완료",
        error: images.length < stylizeCount ? `${stylizeCount - images.length}개 결과는 생성되지 않았습니다.` : null,
      }));

      if (images.length > 0) {
        selectStylizedImage(0, images);
      }
      onJobComplete();
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
      inputImage: { base64: img.base64, artifactId: img.artifactId, mimeType: img.mimeType, preview },
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

    setStep3((s) => ({ ...s, generating: true, error: null, results: [], progress: 0, stage: "작업 등록 중" }));

    try {
      const prompt = buildAnglesPrompt(angles, anglePrompt);
      const images = await runBackgroundJob({
        inputImage: step3.inputImage,
        prompt,
        count: angleCount,
        aspectRatio,
        imageSize,
        onProgress: (progress, stage) => setStep3((state) => ({ ...state, progress, stage })),
      });
      setStep3((s) => ({
        ...s,
        generating: false,
        results: images,
        progress: 100,
        stage: "완료",
        error: images.length < angleCount ? `${angleCount - images.length}개 결과는 생성되지 않았습니다.` : null,
      }));
      onJobComplete();
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
          <div className={styles.generationProgress}>
            <div className={`${styles.loader} ${styles.galleryLoader}`} />
            <strong>{step.stage || "배경을 만들고 있습니다."}</strong>
            <span>{Math.max(0, Math.min(99, step.progress || 0))}%</span>
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
        <div className={styles.outputOptions}>
          <label>
            화면 비율
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)} aria-label="배경 화면 비율">
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
          <div className={styles.qualityToggle} aria-label="배경 출력 품질">
            <button aria-pressed={imageSize === "1K"} className={imageSize === "1K" ? styles.optionActive : ""} onClick={() => setImageSize("1K")}>빠른 1K</button>
            <button aria-pressed={imageSize === "2K"} className={imageSize === "2K" ? styles.optionActive : ""} onClick={() => setImageSize("2K")}>고품질 2K</button>
          </div>
        </div>
        <button className={styles.deleteBtn} onClick={onDelete} title="이 작업 삭제">
          <LuTrash2 size={18} />
        </button>
      </div>

      <section className={styles.quickCreate} aria-labelledby={`quick-background-${id}`}>
        <div className={styles.quickHeading}>
          <h3 id={`quick-background-${id}`}>빠른 배경 만들기</h3>
          <span>텍스트 · 원본 · 목표 그림체</span>
        </div>
        <div className={styles.quickGrid}>
          <div className={styles.quickInputs}>
            <ImageDropZone
              onImageSelect={(image) => { setQuickSource(image); setQuickStep((state) => ({ ...state, results: [], error: null })); }}
              currentImage={quickSource?.preview}
              label="원본 사진"
              disabled={quickStep.generating}
              placeholderText={"원본 사진 (선택)\n클릭, 드래그, 붙여넣기"}
            />
            <ImageDropZone
              onImageSelect={(image) => { setQuickStyle(image); setQuickStep((state) => ({ ...state, results: [], error: null })); }}
              currentImage={quickStyle?.preview}
              label="목표 그림체"
              disabled={quickStep.generating}
              placeholderText={"목표 그림체 (선택)\n클릭, 드래그, 붙여넣기"}
            />
          </div>
          <div className={styles.quickControls}>
            <label className={styles.quickField}>
              <span>배경 설명</span>
              <textarea
                className={styles.promptInput}
                rows={5}
                maxLength={2_000}
                placeholder="예: 노을 지는 해변, 넓은 모래사장과 야자수 실루엣"
                value={quickPrompt}
                disabled={quickStep.generating}
                onChange={(event) => setQuickPrompt(event.target.value)}
              />
            </label>
            <label className={styles.quickField}>
              <span>카메라 앵글</span>
              <select value={quickAngle} disabled={quickStep.generating} onChange={(event) => setQuickAngle(event.target.value)}>
                {ANGLE_OPTIONS.slice(0, 10).map((option) => (
                  <option key={option.prompt} value={option.prompt}>{option.label} · {option.prompt}</option>
                ))}
              </select>
            </label>
            <div className={styles.controlRow}>
              {renderCounter(quickCount, setQuickCount)}
              <button
                className={`${styles.actionBtn} ${styles.quickAction}`}
                onClick={() => void handleQuickGenerate()}
                disabled={quickStep.generating || (!quickPrompt.trim() && !quickSource && !quickStyle)}
              >
                {quickStep.generating ? <div className={styles.loader} /> : <LuSparkles />}
                {quickStep.generating ? "배경 생성 중" : quickStep.results.length > 0 ? "다시 생성" : "배경 생성"}
                <CreditCostBadge
                  credits={getGenerationCreditCost("background", { count: quickCount, imageSize })}
                />
              </button>
            </div>
          </div>
        </div>
        {renderGallery(quickStep, undefined, "background")}
      </section>

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
                <CreditCostBadge
                  credits={getGenerationCreditCost("background", { count: cleanupCount, imageSize })}
                />
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
                <CreditCostBadge
                  credits={getGenerationCreditCost("background", { count: stylizeCount, imageSize })}
                />
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
                  aria-pressed={activeAngles.has(opt.prompt)}
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
                <CreditCostBadge
                  credits={getGenerationCreditCost("background", { count: angleCount, imageSize })}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
