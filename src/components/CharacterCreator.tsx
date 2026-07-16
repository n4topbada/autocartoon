"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuCheck,
  LuDownload,
  LuLoaderCircle,
  LuRefreshCw,
  LuSave,
  LuSparkles,
  LuX,
} from "react-icons/lu";
import {
  buildOriginalCharacterPrompt,
  type CharacterCreatorSettings,
} from "@/lib/character-creator";
import styles from "./CharacterCreator.module.css";

interface JobArtifact {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface CharacterJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  stage: string;
  progress: number;
  prompt: string;
  output?: { imageIds?: string[] } | null;
  error?: string | null;
  createdAt: string;
  artifacts: JobArtifact[];
}

interface SaveTarget {
  imageId: string;
  imageUrl: string;
}

const DEFAULT_SETTINGS: CharacterCreatorSettings = {
  name: "새 캐릭터",
  gender: "여성",
  age: "20대",
  mood: "밝고 친근한",
  hair: "",
  outfit: "",
  style: "현대 한국 웹툰",
  details: "",
  background: "white",
};

const GENDERS = ["여성", "남성", "중성적", "소년", "소녀"];
const AGES = ["어린이", "청소년", "20대", "30대", "중년", "노년"];
const MOODS = ["귀여운", "시크한", "강렬한", "신비로운", "발랄한", "차분한", "판타지"];
const HAIRS = ["긴 생머리", "단발", "포니테일", "곱슬머리", "짧은 머리", "금발", "흑발"];
const OUTFITS = ["교복", "캐주얼", "정장", "후드티", "한복", "판타지 갑옷", "파일럿 슈트"];
const STYLES = ["현대 한국 웹툰", "선명한 애니메이션", "반실사 웹툰", "단순한 카툰", "감성 수채화 일러스트"];
const STAGE_LABELS: Record<string, string> = {
  queued: "대기열 등록",
  preparing_references: "설정 정리",
  generating_image: "캐릭터 생성",
  completed: "완료",
  failed: "실패",
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function imageIdAt(job: CharacterJob, index: number) {
  return Array.isArray(job.output?.imageIds) ? job.output?.imageIds[index] : undefined;
}

function notifyComplete() {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("캐릭터 생성 완료", { body: "새 캐릭터가 결과 목록에 추가되었습니다." });
  }
}

export default function CharacterCreator({ onPresetSaved }: { onPresetSaved?: () => void }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<CharacterJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const completedRef = useRef<Set<string>>(new Set());

  const loadJobs = useCallback(async () => {
    const data = await readJson<{ jobs: CharacterJob[] }>(
      await fetch("/api/jobs?kind=character&limit=20", { cache: "no-store" })
    );
    setJobs(data.jobs);
    return data.jobs;
  }, []);

  useEffect(() => {
    loadJobs()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "결과를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [loadJobs]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === "queued" || job.status === "running"),
    [jobs]
  );

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = window.setInterval(() => {
      loadJobs().catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [activeJobs.length, loadJobs]);

  useEffect(() => {
    if (!trackedJobId) return;
    const tracked = jobs.find((job) => job.id === trackedJobId);
    if (!tracked || tracked.status === "queued" || tracked.status === "running") return;

    setTrackedJobId(null);
    setElapsed(0);
    if (tracked.status === "succeeded" && !completedRef.current.has(tracked.id)) {
      completedRef.current.add(tracked.id);
      setMessage("캐릭터 생성이 완료되었습니다.");
      notifyComplete();
    } else if (tracked.status === "failed") {
      setError(tracked.error || "캐릭터 생성에 실패했습니다.");
    }
  }, [jobs, trackedJobId]);

  useEffect(() => {
    if (!trackedJobId) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [trackedJobId]);

  const updateSetting = <K extends keyof CharacterCreatorSettings>(
    key: K,
    value: CharacterCreatorSettings[K]
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const startGeneration = async (promptOverride?: string) => {
    setStarting(true);
    setError(null);
    setMessage(null);
    try {
      const prompt = promptOverride || buildOriginalCharacterPrompt(settings);
      const data = await readJson<{ job: CharacterJob }>(
        await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            presetIds: [],
            jobKind: "character",
            mode: "text",
            aspectRatio: "1:1",
            imageSize,
            prompt,
          }),
        })
      );
      setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
      setTrackedJobId(data.job.id);
      setElapsed(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "캐릭터 생성을 시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  };

  const retryJob = async (jobId: string) => {
    setError(null);
    try {
      const data = await readJson<{ job: CharacterJob }>(
        await fetch(`/api/jobs/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry" }),
        })
      );
      setJobs((current) => [data.job, ...current]);
      setTrackedJobId(data.job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다시 시도하지 못했습니다.");
    }
  };

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${settings.name.trim() || "character"}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const openSave = (job: CharacterJob, index: number) => {
    const imageId = imageIdAt(job, index);
    if (!imageId) {
      setError("이전 생성 결과는 새 저장 형식을 지원하지 않습니다. 재생성 후 저장해주세요.");
      return;
    }
    setSaveTarget({ imageId, imageUrl: job.artifacts[index].blobUrl });
    setSaveName(settings.name.trim() || "새 캐릭터");
  };

  const savePreset = async () => {
    if (!saveTarget || !saveName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/presets/from-generated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: saveName.trim(),
            imageId: saveTarget.imageId,
            description: settings.details,
          }),
        })
      );
      setSaveTarget(null);
      setMessage("내 캐릭터에 저장했습니다.");
      onPresetSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "캐릭터를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const runningJob = trackedJobId ? jobs.find((job) => job.id === trackedJobId) : undefined;
  const resultJobs = jobs.filter((job) => job.status === "succeeded" && job.artifacts.length > 0);
  const failedJobs = jobs.filter((job) => job.status === "failed").slice(0, 3);

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setImageSize("1K");
    setError(null);
    setMessage(null);
  };

  return (
    <div className={styles.workspace}>
      <aside className={styles.controls}>
        <div className={styles.headingRow}>
          <div>
            <h2>캐릭터 만들기</h2>
            <span>Vertex AI</span>
          </div>
          <LuSparkles size={19} aria-hidden />
        </div>

        <label className={styles.field}>
          <span>이름</span>
          <input
            value={settings.name}
            maxLength={80}
            onChange={(event) => updateSetting("name", event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>성별 표현</span>
          <input value={settings.gender} maxLength={80} placeholder="직접 입력" onChange={(event) => updateSetting("gender", event.target.value)} />
          <div className={styles.chips}>
            {GENDERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.gender === value}
                className={settings.gender === value ? styles.chipSelected : ""}
                onClick={() => updateSetting("gender", value)}
              >
                {value}
              </button>
            ))}
          </div>
        </label>

        <label className={styles.field}>
          <span>연령대</span>
          <input value={settings.age} maxLength={80} placeholder="직접 입력" onChange={(event) => updateSetting("age", event.target.value)} />
          <div className={styles.chips}>
            {AGES.map((value) => <button type="button" key={value} className={settings.age === value ? styles.chipSelected : ""} onClick={() => updateSetting("age", value)}>{value}</button>)}
          </div>
        </label>

        <label className={styles.field}>
          <span>인상과 분위기</span>
          <input value={settings.mood} maxLength={160} placeholder="예: 시크한, 귀여운" onChange={(event) => updateSetting("mood", event.target.value)} />
          <div className={styles.chips}>
            {MOODS.map((value) => <button type="button" key={value} className={settings.mood === value ? styles.chipSelected : ""} onClick={() => updateSetting("mood", value)}>{value}</button>)}
          </div>
        </label>

        <label className={styles.field}>
          <span>헤어스타일</span>
          <input value={settings.hair} placeholder="예: 짧은 흑발 단발" maxLength={240} onChange={(event) => updateSetting("hair", event.target.value)} />
          <div className={styles.chips}>
            {HAIRS.map((value) => <button type="button" key={value} className={settings.hair === value ? styles.chipSelected : ""} onClick={() => updateSetting("hair", value)}>{value}</button>)}
          </div>
        </label>

        <label className={styles.field}>
          <span>의상</span>
          <input value={settings.outfit} placeholder="예: 검은 후드와 청바지" maxLength={240} onChange={(event) => updateSetting("outfit", event.target.value)} />
          <div className={styles.chips}>
            {OUTFITS.map((value) => <button type="button" key={value} className={settings.outfit === value ? styles.chipSelected : ""} onClick={() => updateSetting("outfit", value)}>{value}</button>)}
          </div>
        </label>

        <label className={styles.field}>
          <span>그림 스타일</span>
          <select value={settings.style} onChange={(event) => updateSetting("style", event.target.value)}>
            {STYLES.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>

        <div className={styles.field}>
          <span>배경</span>
          <div className={styles.segmented}>
            <button
              type="button"
              aria-pressed={settings.background === "white"}
              className={settings.background === "white" ? styles.selected : ""}
              onClick={() => updateSetting("background", "white")}
            >
              흰색
            </button>
            <button
              type="button"
              aria-pressed={settings.background === "scene"}
              className={settings.background === "scene" ? styles.selected : ""}
              onClick={() => updateSetting("background", "scene")}
            >
              장면
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <span>출력 품질</span>
          <div className={styles.segmented} aria-label="캐릭터 이미지 출력 품질">
            <button type="button" aria-pressed={imageSize === "1K"} className={imageSize === "1K" ? styles.selected : ""} onClick={() => setImageSize("1K")}>빠른 1K</button>
            <button type="button" aria-pressed={imageSize === "2K"} className={imageSize === "2K" ? styles.selected : ""} onClick={() => setImageSize("2K")}>고품질 2K</button>
          </div>
        </div>

        <label className={styles.field}>
          <span>세부 요구</span>
          <textarea
            value={settings.details}
            maxLength={2_000}
            rows={5}
            placeholder="표정, 체형, 소품, 반드시 유지할 특징"
            onChange={(event) => updateSetting("details", event.target.value)}
          />
          <small>{settings.details.length}/2,000</small>
        </label>

        <div className={styles.formActions}>
          <button type="button" className={styles.resetButton} onClick={resetSettings} disabled={starting || Boolean(trackedJobId)}><LuRefreshCw /> 초기화</button>
          <button
            type="button"
            className={styles.generateButton}
            disabled={starting || Boolean(trackedJobId)}
            onClick={() => startGeneration()}
          >
            {starting || trackedJobId ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />}
            {starting ? "요청 중" : trackedJobId ? "생성 중" : "캐릭터 생성"}
          </button>
        </div>

        {runningJob && (
          <div className={styles.progress} aria-live="polite">
            <div>
              <span>{STAGE_LABELS[runningJob.stage] || "처리 중"}</span>
              <strong>{runningJob.progress}%</strong>
            </div>
            <div className={styles.progressTrack}>
              <span style={{ width: `${runningJob.progress}%` }} />
            </div>
            <small>{elapsed}초</small>
          </div>
        )}
      </aside>

      <section className={styles.results}>
        <div className={styles.resultsHeader}>
          <div>
            <h2>생성 결과</h2>
            <span>{resultJobs.length}개</span>
          </div>
          <button type="button" className={styles.iconButton} title="결과 새로고침" onClick={() => loadJobs()}>
            <LuRefreshCw />
          </button>
        </div>

        {(error || message) && (
          <div className={error ? styles.errorBanner : styles.successBanner} role="status">
            {error ? <LuX /> : <LuCheck />}
            <span>{error || message}</span>
            <button type="button" title="닫기" onClick={() => { setError(null); setMessage(null); }}><LuX /></button>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}><LuLoaderCircle className={styles.spin} /><span>불러오는 중</span></div>
        ) : resultJobs.length === 0 ? (
          <div className={styles.empty}><LuSparkles /><strong>첫 캐릭터를 생성하세요</strong></div>
        ) : (
          <div className={styles.resultGrid}>
            {resultJobs.flatMap((job) => job.artifacts.map((artifact, index) => (
              <article className={styles.resultCard} key={artifact.id}>
                <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="생성한 캐릭터" />
                <div className={styles.resultMeta}>
                  <time>{new Date(job.createdAt).toLocaleString("ko-KR")}</time>
                  <div className={styles.resultActions}>
                    <button type="button" title="같은 설정으로 재생성" onClick={() => startGeneration(job.prompt)} disabled={Boolean(trackedJobId)}>
                      <LuRefreshCw />
                    </button>
                    <button type="button" title="이미지 다운로드" onClick={() => downloadImage(artifact.blobUrl)}>
                      <LuDownload />
                    </button>
                    <button type="button" className={styles.saveButton} onClick={() => openSave(job, index)}>
                      <LuSave /> 내 캐릭터로 저장
                    </button>
                  </div>
                </div>
              </article>
            )))}
          </div>
        )}

        {failedJobs.length > 0 && (
          <div className={styles.failures}>
            <h3>실패한 작업</h3>
            {failedJobs.map((job) => (
              <div key={job.id}>
                <span>{job.error || "생성에 실패했습니다."}</span>
                <button type="button" onClick={() => retryJob(job.id)} disabled={Boolean(trackedJobId)}>
                  <LuRefreshCw /> 다시 시도
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {saveTarget && (
        <div className={styles.modalOverlay} onClick={() => !saving && setSaveTarget(null)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>내 캐릭터로 저장</h2>
              <button type="button" title="닫기" onClick={() => setSaveTarget(null)} disabled={saving}><LuX /></button>
            </div>
            <img src={saveTarget.imageUrl} alt="저장할 캐릭터" />
            <label className={styles.field}>
              <span>캐릭터 이름</span>
              <input value={saveName} maxLength={80} autoFocus onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setSaveTarget(null)} disabled={saving}>취소</button>
              <button type="button" className={styles.confirmButton} onClick={savePreset} disabled={saving || !saveName.trim()}>
                {saving ? <LuLoaderCircle className={styles.spin} /> : <LuSave />} 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
