"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuCheck,
  LuDownload,
  LuImage,
  LuLoaderCircle,
  LuPersonStanding,
  LuRefreshCw,
  LuRotateCcw,
  LuSparkles,
  LuUsers,
  LuX,
} from "react-icons/lu";
import CreditCostBadge from "@/components/CreditCostBadge";
import ImageModelSelector from "@/components/ImageModelSelector";
import ImageDropZone, { type ImageData } from "@/components/ImageDropZone";
import { useResizablePanelWidth } from "@/components/useResizablePanelWidth";
import { getGenerationCreditCost } from "@/lib/credit-products";
import { DEFAULT_IMAGE_MODEL_ID, type ImageModelId } from "@/lib/ai-pricing";
import {
  buildStudioGenerationPrompt,
  CAMERA_ANGLES,
  DEFAULT_STUDIO_SCENE,
} from "@/lib/studio-scene";
import styles from "./GestureGenerator.module.css";

interface PresetImage {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string;
  view?: string;
}

interface CharacterPreset {
  id: string;
  name: string;
  representativeImage: PresetImage | null;
  images: PresetImage[];
}

interface GestureArtifact {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface GestureJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  stage: string;
  progress: number;
  prompt: string;
  error?: string | null;
  creditCost?: number;
  retryCreditCost?: number;
  createdAt: string;
  artifacts: GestureArtifact[];
}

const STAGE_LABELS: Record<string, string> = {
  queued: "대기열 등록",
  preparing_references: "캐릭터 참조 준비",
  generating_image: "제스처 생성",
  saving_artifacts: "결과 저장",
  completed: "완료",
  failed: "실패",
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

async function imageDataFromUrl(url: string, mimeType: string): Promise<ImageData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("이미지를 다시 불러오지 못했습니다.");
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
  return {
    base64: dataUrl.split(",")[1],
    mimeType: blob.type || mimeType,
    preview: dataUrl,
  };
}

function notifyComplete() {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("제스처 생성 완료", { body: "결과가 보관함과 스튜디오 자산에 반영되었습니다." });
  }
}

export default function GestureGenerator({ active = true }: { active?: boolean }) {
  const [layout, setLayout] = useState<"single" | "two">("single");
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [characterUploads, setCharacterUploads] = useState<Array<ImageData | null>>([null]);
  const [styleReference, setStyleReference] = useState<ImageData | null>(null);
  const [prompt, setPrompt] = useState("");
  const [cameraAngle, setCameraAngle] = useState<(typeof CAMERA_ANGLES)[number]["id"]>("front");
  const [backgroundMode, setBackgroundMode] = useState<"scene" | "none">("scene");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const [imageModel, setImageModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL_ID);
  const [jobs, setJobs] = useState<GestureJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const completedRef = useRef(new Set<string>());
  const splitPane = useResizablePanelWidth({
    storageKey: "wony-gesture-generator-panel-width",
    defaultWidth: 440,
  });

  const maxCharacters = layout === "two" ? 2 : 1;
  const uploadCount = characterUploads.filter(Boolean).length;
  const sourceCount = uploadCount + selectedPresetIds.length;
  const generationDisabledReason = sourceCount !== maxCharacters
    ? `캐릭터 ${maxCharacters}명을 선택하거나 업로드하세요.`
    : !prompt.trim()
      ? "원하는 포즈, 표정, 상황을 입력하세요."
      : null;
  const selectedPresets = useMemo(
    () => presets.filter((preset) => selectedPresetIds.includes(preset.id)),
    [presets, selectedPresetIds]
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === "queued" || job.status === "running"),
    [jobs]
  );
  const runningJob = trackedJobId
    ? jobs.find((job) => job.id === trackedJobId)
    : activeJobs[0];
  const resultJobs = jobs.filter((job) => job.status === "succeeded" && job.artifacts.length > 0);
  const failedJobs = jobs.filter((job) => job.status === "failed").slice(0, 3);

  const loadJobs = useCallback(async () => {
    const data = await readJson<{ jobs: GestureJob[] }>(
      await fetch("/api/jobs?kind=gesture&limit=24", { cache: "no-store" })
    );
    setJobs(data.jobs);
    return data.jobs;
  }, []);

  const loadPresets = useCallback(async () => {
    const data = await readJson<{
      groups?: Array<{ presets?: CharacterPreset[] }>;
      ungrouped?: CharacterPreset[];
    }>(await fetch("/api/presets", { cache: "no-store" }));
    setPresets([
      ...(data.ungrouped || []),
      ...(data.groups || []).flatMap((group) => group.presets || []),
    ]);
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    Promise.all([loadJobs(), loadPresets()])
      .catch((cause) => setError(cause instanceof Error ? cause.message : "작업 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [active, loadJobs, loadPresets]);

  useEffect(() => {
    if (!active || activeJobs.length === 0) return;
    const timer = window.setInterval(() => void loadJobs().catch(() => undefined), 2_500);
    return () => window.clearInterval(timer);
  }, [active, activeJobs.length, loadJobs]);

  useEffect(() => {
    if (!trackedJobId) return;
    const tracked = jobs.find((job) => job.id === trackedJobId);
    if (!tracked || tracked.status === "queued" || tracked.status === "running") return;
    setTrackedJobId(null);
    setElapsed(0);
    if (tracked.status === "succeeded" && !completedRef.current.has(tracked.id)) {
      completedRef.current.add(tracked.id);
      setMessage("제스처가 완성되어 보관함과 스튜디오 자산에 추가되었습니다.");
      notifyComplete();
    } else if (tracked.status === "failed") {
      setError(tracked.error || "제스처 생성에 실패했습니다.");
    }
  }, [jobs, trackedJobId]);

  useEffect(() => {
    if (!trackedJobId) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [trackedJobId]);

  const changeLayout = (next: "single" | "two") => {
    const nextMax = next === "two" ? 2 : 1;
    const nextUploads = next === "two"
      ? [characterUploads[0] || null, characterUploads[1] || null]
      : [characterUploads[0] || null];
    const nextUploadCount = nextUploads.filter(Boolean).length;
    setLayout(next);
    setCharacterUploads(nextUploads);
    setSelectedPresetIds((current) => current.slice(0, Math.max(0, nextMax - nextUploadCount)));
    setError(null);
  };

  const setCharacterUpload = (index: number, image: ImageData | null) => {
    const next = Array.from({ length: maxCharacters }, (_, slot) => characterUploads[slot] || null);
    next[index] = image;
    setCharacterUploads(next);
    const nextUploadCount = next.filter(Boolean).length;
    setSelectedPresetIds((current) => current.slice(0, Math.max(0, maxCharacters - nextUploadCount)));
  };

  const togglePreset = (presetId: string) => {
    setError(null);
    setSelectedPresetIds((current) => {
      if (current.includes(presetId)) return current.filter((id) => id !== presetId);
      if (current.length + uploadCount >= maxCharacters) {
        setError(`${layout === "two" ? "2명" : "1명"}까지 선택할 수 있습니다.`);
        return current;
      }
      return [...current, presetId];
    });
  };

  const startGeneration = async () => {
    if (sourceCount !== maxCharacters) {
      setError(`캐릭터 ${maxCharacters}명을 선택하거나 업로드해 주세요.`);
      return;
    }
    if (!prompt.trim()) {
      setError("원하는 포즈, 표정, 상황을 입력해 주세요.");
      return;
    }
    setStarting(true);
    setError(null);
    setMessage(null);
    try {
      const settings = {
        ...DEFAULT_STUDIO_SCENE,
        cameraAngle,
        gestureLayout: layout,
        backgroundMode,
        characterPresetIds: selectedPresetIds,
        characterDirections: {},
        referenceAssetIds: [],
      };
      const generatedPrompt = buildStudioGenerationPrompt({
        prompt: [
          prompt.trim(),
          styleReference
            ? "첫 번째 참고 이미지는 그림체 전용 참조다. 선화, 채색법, 색감, 명암과 질감만 따르고 인물 외형이나 구도는 복제하지 않는다."
            : "",
          uploadCount > 0
            ? `그림체 이미지 다음에 첨부된 ${uploadCount}장은 순서대로 캐릭터 정체성 참조다. 각 캐릭터의 얼굴, 머리 모양, 체형, 의상, 소품, 고유 색상과 선 비율을 그대로 유지하고 포즈와 표정만 요청에 맞게 바꾼다. 서로의 특징을 섞거나 새로운 디자인으로 재해석하지 않는다.`
            : "",
        ].filter(Boolean).join("\n"),
        mode: "gesture",
        settings,
        characters: selectedPresets.map((preset) => ({ id: preset.id, name: preset.name })),
      });
      const inputImages = [...(styleReference ? [styleReference] : []), ...characterUploads.filter((image): image is ImageData => Boolean(image))]
        .filter((image) => Boolean(image.base64))
        .map((image) => ({ base64: image.base64!, mimeType: image.mimeType }));
      const data = await readJson<{ job: GestureJob }>(await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          presetIds: selectedPresetIds,
          jobKind: "gesture",
          mode: "text",
          aspectRatio,
          imageModel,
          imageSize,
          prompt: generatedPrompt,
          ...(inputImages.length ? { inputImages } : {}),
          ...(styleReference ? { styleReferenceFirst: true } : {}),
        }),
      }));
      setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
      setTrackedJobId(data.job.id);
      setElapsed(0);
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "제스처 생성을 시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  };

  const retryJob = async (jobId: string) => {
    setError(null);
    try {
      const data = await readJson<{ job: GestureJob }>(await fetch(`/api/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      }));
      setJobs((current) => [data.job, ...current]);
      setTrackedJobId(data.job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다시 시도하지 못했습니다.");
    }
  };

  const download = async (artifact: GestureArtifact) => {
    try {
      const response = await fetch(artifact.blobUrl);
      if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `gesture-${artifact.id}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(artifact.blobUrl, "_blank", "noopener,noreferrer");
    }
  };

  const continueFromResult = async (artifact: GestureArtifact) => {
    setError(null);
    try {
      const image = await imageDataFromUrl(artifact.blobUrl, artifact.mimeType);
      changeLayout("single");
      setSelectedPresetIds([]);
      setCharacterUploads([image]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "결과를 다시 불러오지 못했습니다.");
    }
  };

  const reset = () => {
    setLayout("single");
    setSelectedPresetIds([]);
    setCharacterUploads([null]);
    setStyleReference(null);
    setPrompt("");
    setCameraAngle("front");
    setBackgroundMode("scene");
    setAspectRatio("1:1");
    setImageSize("1K");
    setError(null);
    setMessage(null);
  };

  return (
    <div ref={splitPane.containerRef} className={styles.workspace} style={splitPane.style}>
      <aside className={styles.controls}>
        <div className={styles.headingRow}>
          <div><h2>제스처 만들기</h2><span>Vertex AI</span></div>
          <LuPersonStanding aria-hidden />
        </div>

        <div className={styles.segmented} aria-label="제스처 인원">
          <button type="button" aria-pressed={layout === "single"} onClick={() => changeLayout("single")}><LuPersonStanding /> 1인</button>
          <button type="button" aria-pressed={layout === "two"} onClick={() => changeLayout("two")}><LuUsers /> 2인 장면</button>
        </div>

        <section className={styles.controlSection}>
          <div className={styles.sectionHeading}><strong>캐릭터</strong><span>{sourceCount}/{maxCharacters}</span></div>
          {presets.length > 0 && (
            <div className={styles.presetGrid}>
              {presets.map((preset) => {
                const image = preset.representativeImage || preset.images[0];
                const selected = selectedPresetIds.includes(preset.id);
                const disabled = !selected && sourceCount >= maxCharacters;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    className={selected ? styles.presetSelected : ""}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => togglePreset(preset.id)}
                    title={preset.name}
                  >
                    {image ? <img src={image.thumbnailUrl || image.dataUrl} alt="" /> : <LuImage />}
                    <span>{preset.name}</span>
                    {selected && <LuCheck className={styles.check} />}
                  </button>
                );
              })}
            </div>
          )}
          <div className={styles.uploadGrid}>
            {Array.from({ length: maxCharacters }, (_, index) => (
              <div className={styles.uploadSlot} key={index}>
                <ImageDropZone
                  currentImage={characterUploads[index]?.preview}
                  onImageSelect={(image) => setCharacterUpload(index, image)}
                  label={`캐릭터 ${index + 1}`}
                  placeholderText={`캐릭터 ${index + 1}\n클릭 또는 드래그`}
                />
                {characterUploads[index] && <button type="button" className={styles.clearUpload} onClick={() => setCharacterUpload(index, null)} title="업로드 제거"><LuX /></button>}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.controlSection}>
          <div className={styles.sectionHeading}><strong>그림체 참고</strong><span>선택</span></div>
          <div className={styles.styleUpload}>
            <ImageDropZone
              currentImage={styleReference?.preview}
              onImageSelect={setStyleReference}
              label="그림체"
              placeholderText="그림체 참고 이미지"
            />
            {styleReference && <button type="button" className={styles.clearUpload} onClick={() => setStyleReference(null)} title="그림체 제거"><LuX /></button>}
          </div>
        </section>

        <label className={styles.field}>
          <span>포즈와 상황</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={4_000}
            rows={5}
            placeholder="예: 카페에서 커피를 들고 웃는 상반신 포즈"
          />
          <small>{prompt.length}/4,000</small>
        </label>

        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span>카메라 앵글</span>
            <select value={cameraAngle} onChange={(event) => setCameraAngle(event.target.value as typeof cameraAngle)}>
              {CAMERA_ANGLES.map((angle) => <option key={angle.id} value={angle.id}>{angle.label} · {angle.description}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>화면 비율</span>
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="9:16">9:16</option>
            </select>
          </label>
        </div>

        <div className={styles.optionRow}>
          <div className={styles.optionGroup}><span>배경</span><div className={styles.compactSegment}><button type="button" aria-pressed={backgroundMode === "scene"} onClick={() => setBackgroundMode("scene")}>포함</button><button type="button" aria-pressed={backgroundMode === "none"} onClick={() => setBackgroundMode("none")}>없음</button></div></div>
        </div>
        <ImageModelSelector
          modelId={imageModel}
          resolution={imageSize}
          onModelChange={setImageModel}
          onResolutionChange={setImageSize}
          disabled={starting || Boolean(trackedJobId)}
        />

        <div className={styles.formActions}>
          <button type="button" className={styles.resetButton} onClick={reset} disabled={starting}><LuRefreshCw /> 초기화</button>
          <button
            type="button"
            className={styles.generateButton}
            onClick={() => void startGeneration()}
            disabled={starting || Boolean(trackedJobId) || Boolean(generationDisabledReason)}
            title={generationDisabledReason || undefined}
          >
            {starting || trackedJobId ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />}
            {starting ? "요청 중" : trackedJobId ? "생성 중" : "제스처 생성"}
            <CreditCostBadge credits={getGenerationCreditCost("gesture", { imageModel, imageSize })} />
          </button>
        </div>

        {runningJob && (
          <div className={styles.progress} aria-live="polite">
            <div><span>{STAGE_LABELS[runningJob.stage] || "처리 중"}</span><strong>{runningJob.progress}%</strong></div>
            <div className={styles.progressTrack}><span style={{ width: `${runningJob.progress}%` }} /></div>
            <small>{elapsed}초</small>
          </div>
        )}
      </aside>

      <div
        {...splitPane.separatorProps}
        className={`${styles.panelResizer} ${splitPane.resizing ? styles.panelResizerActive : ""}`}
        aria-label="제스처 설정 패널 너비 조절"
        title="드래그해 설정 패널 너비 조절 · 더블클릭 초기화"
      />

      <section className={styles.results}>
        <div className={styles.resultsHeader}>
          <div><h2>제스처 자산</h2><span>{resultJobs.reduce((count, job) => count + job.artifacts.length, 0)}개</span></div>
          <button type="button" className={styles.iconButton} onClick={() => void loadJobs()} title="결과 새로고침"><LuRefreshCw /></button>
        </div>

        {(error || message) && (
          <div className={error ? styles.errorBanner : styles.successBanner} role="status">
            {error ? <LuX /> : <LuCheck />}
            <span>{error || message}</span>
            <button type="button" onClick={() => { setError(null); setMessage(null); }} title="닫기"><LuX /></button>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}><LuLoaderCircle className={styles.spin} /></div>
        ) : resultJobs.length === 0 ? (
          <div className={styles.empty}><LuPersonStanding /><strong>첫 제스처를 만들어 보세요.</strong></div>
        ) : (
          <div className={styles.resultGrid}>
            {resultJobs.flatMap((job) => job.artifacts.map((artifact) => (
              <article className={styles.resultCard} key={artifact.id}>
                <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="생성된 제스처" />
                <div className={styles.resultMeta}>
                  <time>{new Date(job.createdAt).toLocaleDateString("ko-KR")}</time>
                  <div>
                    <button type="button" onClick={() => void continueFromResult(artifact)} title="이 결과로 계속 만들기"><LuRotateCcw /></button>
                    <button type="button" onClick={() => void download(artifact)} title="다운로드"><LuDownload /></button>
                  </div>
                </div>
              </article>
            )))}
          </div>
        )}

        {failedJobs.length > 0 && (
          <div className={styles.failedList}>
            {failedJobs.map((job) => (
              <div key={job.id}>
                <span>{job.error || "생성 실패"}</span>
                <button type="button" onClick={() => void retryJob(job.id)}>
                  <LuRotateCcw /> 다시 시도
                  <CreditCostBadge
                    credits={job.retryCreditCost ?? getGenerationCreditCost("gesture", { imageModel, imageSize })}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
