"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { upload } from "@vercel/blob/client";
import {
  LuArrowLeft,
  LuCheck,
  LuChevronRight,
  LuClapperboard,
  LuFolderKanban,
  LuImage,
  LuLoaderCircle,
  LuMic,
  LuEllipsis,
  LuPlay,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuSave,
  LuSparkles,
  LuTrash2,
  LuUpload,
  LuVideo,
  LuVolume2,
  LuWandSparkles,
  LuX,
} from "react-icons/lu";
import styles from "./StudioWorkspace.module.css";

const CanvasEditor = dynamic(() => import("./CanvasEditor"), { ssr: false });

type StudioMode = "scene" | "gesture" | "video";
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

interface ProjectSummary {
  id: string;
  title: string;
  aspectRatio: string;
  updatedAt: string;
  cuts: ProjectCut[];
  _count: { cuts: number; assets: number; jobs: number };
}

interface ProjectCut {
  id: string;
  order: number;
  title: string;
  durationMs: number;
  prompt: string;
  negativePrompt: string | null;
  dialogue: string | null;
  speakerPresetId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
}

interface ProjectAsset {
  id: string;
  kind: "image" | "video";
  name: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
}

interface JobArtifact {
  id: string;
  kind: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
}

interface GenerationJob {
  id: string;
  kind: string;
  status: JobStatus;
  stage: string;
  progress: number;
  prompt: string;
  error: string | null;
  createdAt: string;
  artifacts: JobArtifact[];
}

interface StudioProject extends Omit<ProjectSummary, "_count"> {
  description: string | null;
  canvasWidth: number;
  canvasHeight: number;
  status: string;
  assets: ProjectAsset[];
  jobs: GenerationJob[];
}

interface CharacterImage {
  id: string;
  view?: string;
  dataUrl: string;
  thumbnailUrl?: string;
}

interface CharacterPreset {
  id: string;
  name: string;
  userId?: string | null;
  description?: string | null;
  images: CharacterImage[];
  representativeImage: CharacterImage | null;
}

interface CutDraft {
  title: string;
  prompt: string;
  negativePrompt: string;
  dialogue: string;
  durationMs: number;
}

const EMPTY_DRAFT: CutDraft = {
  title: "",
  prompt: "",
  negativePrompt: "",
  dialogue: "",
  durationMs: 5000,
};

const VIEW_LABELS: Record<string, string> = {
  reference: "참조",
  front: "정면",
  left: "좌측",
  right: "우측",
  back: "후면",
};

const STAGE_LABELS: Record<string, string> = {
  queued: "대기",
  preparing_references: "참조 준비",
  generating_image: "이미지 생성",
  submitting_video: "Veo 요청",
  waiting_for_video: "Veo 렌더링",
  saving_video: "영상 저장",
  completed: "완료",
  failed: "실패",
  credit_rejected: "크레딧 부족",
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "요청 처리에 실패했습니다.");
  return body as T;
}

function announceCompletion(job: GenerationJob) {
  const message = job.status === "succeeded"
    ? `${job.kind === "video" ? "영상" : "이미지"} 생성이 완료되었습니다.`
    : job.error || "생성 작업에 실패했습니다.";
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("AutoCartoon Studio", { body: message });
  }
}

export default function StudioWorkspace() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterPreset[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CutDraft>(EMPTY_DRAFT);
  const [mode, setMode] = useState<StudioMode>("scene");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(true);
  const [editingCut, setEditingCut] = useState(false);
  const [videoOptions, setVideoOptions] = useState({
    aspectRatio: "9:16" as "9:16" | "16:9",
    durationSeconds: 8 as 4 | 6 | 8,
    resolution: "720p" as "720p" | "1080p",
    generateAudio: true,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const knownStatuses = useRef(new Map<string, JobStatus>());
  const draftCutId = useRef<string | null>(null);

  const selectedCut = useMemo(
    () => project?.cuts.find((cut) => cut.id === selectedCutId) ?? project?.cuts[0] ?? null,
    [project?.cuts, selectedCutId]
  );
  const selectedAsset = useMemo(
    () => project?.assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [project?.assets, selectedAssetId]
  );
  const selectedCharacters = useMemo(
    () => characters.filter((character) => selectedCharacterIds.includes(character.id)),
    [characters, selectedCharacterIds]
  );

  const loadProjects = useCallback(async () => {
    const data = await readJson<{ projects: ProjectSummary[] }>(
      await fetch("/api/studio/projects", { cache: "no-store" })
    );
    setProjects(data.projects);
    return data.projects;
  }, []);

  const loadProject = useCallback(async (projectId: string) => {
    const data = await readJson<{ project: StudioProject }>(
      await fetch(`/api/studio/projects/${projectId}`, { cache: "no-store" })
    );
    for (const job of data.project.jobs) {
      const previous = knownStatuses.current.get(job.id);
      if (previous && ["queued", "running"].includes(previous) && ["succeeded", "failed"].includes(job.status)) {
        announceCompletion(job);
      }
      knownStatuses.current.set(job.id, job.status);
    }
    setProject(data.project);
    setSelectedCutId((current) =>
      data.project.cuts.some((cut) => cut.id === current)
        ? current
        : data.project.cuts[0]?.id ?? null
    );
    return data.project;
  }, []);

  const loadCharacters = useCallback(async () => {
    const data = await readJson<{
      groups: Array<{ presets: CharacterPreset[] }>;
      ungrouped: CharacterPreset[];
    }>(await fetch("/api/presets", { cache: "no-store" }));
    const all = [...data.ungrouped, ...data.groups.flatMap((group) => group.presets)];
    setCharacters(Array.from(new Map(all.map((item) => [item.id, item])).values()));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([loadProjects(), loadCharacters()])
      .then(async ([items]) => {
        if (!active || items.length === 0) return;
        await loadProject(items[0].id);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "초기화 실패"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadCharacters, loadProject, loadProjects]);

  useEffect(() => {
    if (!selectedCut) {
      draftCutId.current = null;
      setDraft(EMPTY_DRAFT);
      return;
    }
    if (draftCutId.current === selectedCut.id) return;
    draftCutId.current = selectedCut.id;
    setDraft({
      title: selectedCut.title,
      prompt: selectedCut.prompt,
      negativePrompt: selectedCut.negativePrompt || "",
      dialogue: selectedCut.dialogue || "",
      durationMs: selectedCut.durationMs,
    });
    setSaveState("idle");
  }, [selectedCut]);

  useEffect(() => {
    if (!project?.jobs.some((job) => job.status === "queued" || job.status === "running")) return;
    const timer = window.setInterval(() => {
      void loadProject(project.id).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadProject, project?.id, project?.jobs]);

  const createProject = async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await readJson<{ project: StudioProject }>(
        await fetch("/api/studio/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `새 프로젝트 ${projects.length + 1}` }),
        })
      );
      await loadProjects();
      await loadProject(data.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  const updateProjectTitle = async (title: string) => {
    if (!project || !title.trim() || title.trim() === project.title) return;
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      }));
      await loadProjects();
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 저장 실패");
    }
  };

  const deleteProject = async () => {
    if (!project || !window.confirm(`'${project.title}' 프로젝트를 삭제할까요?`)) return;
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}`, { method: "DELETE" }));
      const items = await loadProjects();
      if (items[0]) await loadProject(items[0].id);
      else setProject(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 삭제 실패");
    }
  };

  const addCut = async () => {
    if (!project) return;
    try {
      const data = await readJson<{ cut: ProjectCut }>(
        await fetch(`/api/studio/projects/${project.id}/cuts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      );
      await loadProject(project.id);
      setSelectedCutId(data.cut.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "컷 추가 실패");
    }
  };

  const deleteCut = async () => {
    if (!project || !selectedCut || project.cuts.length <= 1) return;
    if (!window.confirm(`${selectedCut.title}을 삭제할까요?`)) return;
    try {
      await readJson(await fetch(`/api/studio/cuts/${selectedCut.id}`, { method: "DELETE" }));
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "컷 삭제 실패");
    }
  };

  const saveCut = useCallback(async () => {
    if (!project || !selectedCut) return;
    setSaveState("saving");
    try {
      const data = await readJson<{ cut: ProjectCut }>(
        await fetch(`/api/studio/cuts/${selectedCut.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        })
      );
      setProject((current) => current
        ? { ...current, cuts: current.cuts.map((cut) => cut.id === data.cut.id ? data.cut : cut) }
        : current
      );
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : "컷 저장 실패");
    }
  }, [draft, project, selectedCut]);

  const updateDraft = <K extends keyof CutDraft>(key: K, value: CutDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
  };

  const toggleCharacter = (id: string) => {
    setSelectedCharacterIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return current.length >= 4 ? current : [...current, id];
    });
  };

  const setCharacterImageView = async (presetId: string, imageId: string, view: string) => {
    try {
      await readJson(await fetch(`/api/presets/${presetId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, view }),
      }));
      setCharacters((current) => current.map((character) =>
        character.id === presetId
          ? {
              ...character,
              images: character.images.map((image) => image.id === imageId ? { ...image, view } : image),
            }
          : character
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "방향 저장 실패");
    }
  };

  const startImageGeneration = async () => {
    if (!project || !selectedCut || selectedCharacterIds.length === 0 || !draft.prompt.trim()) {
      setError("캐릭터와 장면 프롬프트를 선택하세요.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await saveCut();
      const prompt = mode === "gesture"
        ? `${draft.prompt}\n\n[제스처 지시] 캐릭터의 전신 포즈와 손동작, 표정을 명확하게 표현하고 캐릭터 일관성을 유지하세요.`
        : draft.prompt;
      await readJson(await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          presetIds: selectedCharacterIds,
          mode: "text",
          aspectRatio: project.aspectRatio,
          jobKind: mode === "gesture" ? "gesture" : "image",
          prompt,
          projectId: project.id,
          cutId: selectedCut.id,
        }),
      }));
      await loadProject(project.id);
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지 작업 시작 실패");
    } finally {
      setGenerating(false);
    }
  };

  const startVideoGeneration = async () => {
    if (!project || !selectedCut || !draft.prompt.trim()) {
      setError("영상 프롬프트를 입력하세요.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await saveCut();
      await readJson(await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          kind: "video",
          projectId: project.id,
          cutId: selectedCut.id,
          prompt: draft.prompt,
          negativePrompt: draft.negativePrompt,
          sourceAssetId: selectedAsset?.kind === "image" ? selectedAsset.id : undefined,
          ...videoOptions,
        }),
      }));
      await loadProject(project.id);
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "영상 작업 시작 실패");
    } finally {
      setGenerating(false);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await readJson(await fetch(`/api/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      }));
      if (project) await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "재시도 실패");
    }
  };

  const uploadAssets = async (files: FileList) => {
    if (!project || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        await upload(`studio/${project.id}/${safeName}`, file, {
          access: "public",
          handleUploadUrl: "/api/studio/assets/upload",
          clientPayload: JSON.stringify({ projectId: project.id, name: file.name }),
          multipart: file.size > 5 * 1024 * 1024,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "자산 업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!project) return;
    try {
      await readJson(await fetch(`/api/studio/assets/${assetId}`, { method: "DELETE" }));
      if (selectedAssetId === assetId) setSelectedAssetId(null);
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "자산 삭제 실패");
    }
  };

  const previewDialogue = () => {
    if (!draft.dialogue.trim() || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(draft.dialogue);
    utterance.lang = "ko-KR";
    window.speechSynthesis.speak(utterance);
  };

  if (loading) {
    return (
      <main className={styles.loadingScreen}>
        <LuLoaderCircle className={styles.spin} size={28} />
        <span>스튜디오를 준비하고 있습니다.</span>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.backButton} title="캐릭터 생성으로 돌아가기">
          <LuArrowLeft size={18} />
        </Link>
        <div className={styles.brand}>
          <LuClapperboard size={20} />
          <strong>AutoCartoon Studio</strong>
        </div>
        {project && (
          <input
            className={styles.projectTitleInput}
            defaultValue={project.title}
            key={project.id}
            onBlur={(event) => void updateProjectTitle(event.target.value)}
            aria-label="프로젝트 이름"
          />
        )}
        <div className={styles.headerActions}>
          <span className={styles.saveIndicator}>
            {saveState === "saving" && <><LuLoaderCircle className={styles.spin} /> 저장 중</>}
            {saveState === "saved" && <><LuCheck /> 저장됨</>}
            {saveState === "error" && "저장 실패"}
          </span>
          <button className={styles.iconButton} onClick={() => void saveCut()} title="현재 컷 저장">
            <LuSave size={17} />
          </button>
          <button className={styles.iconButton} onClick={() => project && void loadProject(project.id)} title="새로고침">
            <LuRefreshCw size={17} />
          </button>
          <button className={styles.iconButtonDanger} onClick={() => void deleteProject()} title="프로젝트 삭제">
            <LuTrash2 size={17} />
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorBar} role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} title="닫기"><LuX size={16} /></button>
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.projectRail}>
          <div className={styles.panelHeading}>
            <span><LuFolderKanban /> 프로젝트</span>
            <button className={styles.smallIconButton} onClick={() => void createProject()} disabled={creating} title="새 프로젝트">
              {creating ? <LuLoaderCircle className={styles.spin} /> : <LuPlus />}
            </button>
          </div>
          <div className={styles.projectList}>
            {projects.map((item) => (
              <button
                key={item.id}
                className={`${styles.projectItem} ${project?.id === item.id ? styles.projectItemActive : ""}`}
                onClick={() => void loadProject(item.id)}
              >
                <span className={styles.projectThumb}>
                  {item.cuts[0]?.thumbnailUrl || item.cuts[0]?.imageUrl ? (
                    <img src={item.cuts[0].thumbnailUrl || item.cuts[0].imageUrl || ""} alt="" />
                  ) : (
                    <LuImage size={18} />
                  )}
                </span>
                <span className={styles.projectMeta}>
                  <strong>{item.title}</strong>
                  <small>{item._count.cuts}컷 · {item.aspectRatio}</small>
                </span>
                <LuChevronRight size={14} />
              </button>
            ))}
            {projects.length === 0 && (
              <button className={styles.emptyProject} onClick={() => void createProject()}>
                <LuPlus size={18} /> 첫 프로젝트 만들기
              </button>
            )}
          </div>

          {project && (
            <>
              <div className={styles.panelHeading}>
                <span><LuClapperboard /> 컷</span>
                <button className={styles.smallIconButton} onClick={() => void addCut()} title="새 컷">
                  <LuPlus />
                </button>
              </div>
              <div className={styles.cutList}>
                {project.cuts.map((cut) => (
                  <button
                    key={cut.id}
                    className={`${styles.cutItem} ${selectedCut?.id === cut.id ? styles.cutItemActive : ""}`}
                    onClick={() => setSelectedCutId(cut.id)}
                  >
                    <span>{String(cut.order + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{cut.title}</strong>
                      <small>{(cut.durationMs / 1000).toFixed(0)}초</small>
                    </div>
                    {cut.videoUrl ? <LuVideo /> : cut.imageUrl ? <LuImage /> : null}
                  </button>
                ))}
              </div>
              <button
                className={styles.deleteCutButton}
                onClick={() => void deleteCut()}
                disabled={project.cuts.length <= 1}
              >
                <LuTrash2 /> 현재 컷 삭제
              </button>
            </>
          )}
        </aside>

        <main className={styles.stageColumn}>
          <div className={styles.modeBar} aria-label="생성 모드">
            <button className={mode === "scene" ? styles.modeActive : ""} onClick={() => setMode("scene")}>
              <LuImage /> 장면
            </button>
            <button className={mode === "gesture" ? styles.modeActive : ""} onClick={() => setMode("gesture")}>
              <LuWandSparkles /> 제스처
            </button>
            <button className={mode === "video" ? styles.modeActive : ""} onClick={() => setMode("video")}>
              <LuVideo /> Veo 영상
            </button>
          </div>

          <div className={styles.stageArea}>
            {selectedCut?.imageUrl && mode !== "video" && (
              <button
                className={styles.stageEditButton}
                onClick={() => setEditingCut(true)}
                title="현재 컷을 캔버스에서 편집"
              >
                <LuPencil size={16} /> 캔버스 편집
              </button>
            )}
            <div
              className={styles.canvasFrame}
              style={{ aspectRatio: project?.aspectRatio.replace(":", " / ") || "9 / 16" }}
            >
              {mode === "video" && selectedCut?.videoUrl ? (
                <video src={selectedCut.videoUrl} controls playsInline className={styles.stageMedia} />
              ) : selectedCut?.imageUrl ? (
                <img src={selectedCut.imageUrl} alt={selectedCut.title} className={styles.stageMedia} />
              ) : (
                <div className={styles.emptyCanvas}>
                  <LuSparkles size={28} />
                  <strong>비어 있는 컷</strong>
                  <span>프롬프트를 입력하고 장면을 생성하세요.</span>
                </div>
              )}
            </div>
          </div>

          <section className={styles.assetStrip}>
            <button className={styles.assetStripHeading} onClick={() => setAssetPanelOpen((open) => !open)}>
              <span>프로젝트 자산 {project ? project.assets.length : 0}</span>
              <LuEllipsis />
            </button>
            {assetPanelOpen && (
              <div className={styles.assetScroller}>
                <button className={styles.uploadTile} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <LuLoaderCircle className={styles.spin} /> : <LuUpload />}
                  <span>업로드</span>
                </button>
                {project?.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`${styles.assetTile} ${selectedAssetId === asset.id ? styles.assetTileActive : ""}`}
                  >
                    <button
                      className={styles.assetSelect}
                      onClick={() => setSelectedAssetId(asset.id)}
                      aria-label={`${asset.name} 선택`}
                      title={asset.name}
                    >
                      {asset.kind === "video" ? (
                        <video src={asset.blobUrl} muted preload="metadata" />
                      ) : (
                        <img src={asset.thumbnailUrl || asset.blobUrl} alt="" />
                      )}
                      <span>{asset.name}</span>
                    </button>
                    <button
                      className={styles.assetDelete}
                      onClick={() => void deleteAsset(asset.id)}
                      aria-label={`${asset.name} 삭제`}
                      title="자산 삭제"
                    >
                      <LuX />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void uploadAssets(event.target.files);
                event.target.value = "";
              }}
            />
          </section>

          <section className={styles.jobTray}>
            <div className={styles.jobTrayTitle}>생성 작업</div>
            <div className={styles.jobList}>
              {project?.jobs.slice(0, 8).map((job) => (
                <div key={job.id} className={styles.jobRow}>
                  <span className={`${styles.jobStatus} ${styles[`job_${job.status}`] || ""}`}>
                    {job.status === "running" || job.status === "queued" ? <LuLoaderCircle className={styles.spin} /> : job.status === "succeeded" ? <LuCheck /> : <LuX />}
                  </span>
                  <div className={styles.jobInfo}>
                    <strong>{job.kind === "video" ? "Veo 영상" : "AI 이미지"}</strong>
                    <small title={job.error || undefined}>
                      {job.error || STAGE_LABELS[job.stage] || job.stage}
                    </small>
                  </div>
                  <div className={styles.progressTrack}>
                    <span style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className={styles.progressValue}>{job.progress}%</span>
                  {job.status === "failed" && (
                    <button className={styles.retryButton} onClick={() => void retryJob(job.id)} title="다시 시도">
                      <LuRefreshCw />
                    </button>
                  )}
                </div>
              ))}
              {!project?.jobs.length && <span className={styles.emptyJobs}>아직 생성 작업이 없습니다.</span>}
            </div>
          </section>
        </main>

        <aside className={styles.inspector}>
          {selectedCut ? (
            <>
              <div className={styles.inspectorSection}>
                <div className={styles.sectionTitleRow}>
                  <h2>컷 설정</h2>
                  <span>#{selectedCut.order + 1}</span>
                </div>
                <label className={styles.field}>
                  <span>제목</span>
                  <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>장면 프롬프트</span>
                  <textarea rows={6} value={draft.prompt} onChange={(event) => updateDraft("prompt", event.target.value)} placeholder="카메라, 인물 행동, 표정, 배경을 구체적으로 입력" />
                </label>
                <label className={styles.field}>
                  <span>제외 요소</span>
                  <textarea rows={2} value={draft.negativePrompt} onChange={(event) => updateDraft("negativePrompt", event.target.value)} placeholder="왜곡, 텍스트, 추가 인물" />
                </label>
              </div>

              {mode !== "video" && (
                <div className={styles.inspectorSection}>
                  <div className={styles.sectionTitleRow}>
                    <h2>캐릭터</h2>
                    <span>{selectedCharacterIds.length}/4</span>
                  </div>
                  <div className={styles.characterGrid}>
                    {characters.map((character) => {
                      const image = character.representativeImage || character.images[0];
                      const selected = selectedCharacterIds.includes(character.id);
                      return (
                        <button
                          key={character.id}
                          className={selected ? styles.characterActive : ""}
                          onClick={() => toggleCharacter(character.id)}
                        >
                          <span>{image ? <img src={image.thumbnailUrl || image.dataUrl} alt="" /> : <LuImage />}</span>
                          <small>{character.name}</small>
                          {selected && <LuCheck className={styles.characterCheck} />}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCharacters.map((character) => (
                    <div className={styles.characterViews} key={character.id}>
                      <strong>{character.name} · 4면 참조</strong>
                      <div>
                        {character.images.map((image) => (
                          <label key={image.id}>
                            <img src={image.thumbnailUrl || image.dataUrl} alt="캐릭터 참조" />
                            <select
                              value={image.view || "reference"}
                              onChange={(event) => void setCharacterImageView(character.id, image.id, event.target.value)}
                            >
                              {Object.entries(VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.inspectorSection}>
                <div className={styles.sectionTitleRow}>
                  <h2>대사</h2>
                  <button className={styles.smallIconButton} onClick={previewDialogue} title="브라우저 음성으로 미리듣기">
                    <LuVolume2 />
                  </button>
                </div>
                <label className={styles.field}>
                  <span><LuMic /> 대사 내용</span>
                  <textarea rows={3} value={draft.dialogue} onChange={(event) => updateDraft("dialogue", event.target.value)} placeholder="이 컷에서 말할 대사" />
                </label>
              </div>

              {mode === "video" && (
                <div className={styles.inspectorSection}>
                  <h2>Veo 설정</h2>
                  <div className={styles.twoColumnFields}>
                    <label className={styles.field}>
                      <span>화면 비율</span>
                      <select value={videoOptions.aspectRatio} onChange={(event) => setVideoOptions((current) => ({ ...current, aspectRatio: event.target.value as "9:16" | "16:9" }))}>
                        <option value="9:16">9:16 세로</option>
                        <option value="16:9">16:9 가로</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>길이</span>
                      <select value={videoOptions.durationSeconds} onChange={(event) => setVideoOptions((current) => ({ ...current, durationSeconds: Number(event.target.value) as 4 | 6 | 8 }))}>
                        <option value={4}>4초</option>
                        <option value={6}>6초</option>
                        <option value={8}>8초</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>해상도</span>
                      <select value={videoOptions.resolution} onChange={(event) => setVideoOptions((current) => ({ ...current, resolution: event.target.value as "720p" | "1080p" }))}>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </label>
                    <label className={styles.toggleField}>
                      <input type="checkbox" checked={videoOptions.generateAudio} onChange={(event) => setVideoOptions((current) => ({ ...current, generateAudio: event.target.checked }))} />
                      <span>Veo 오디오</span>
                    </label>
                  </div>
                  <div className={styles.sourceAssetInfo}>
                    {selectedAsset?.kind === "image" ? (
                      <><LuImage /> 시작 이미지: {selectedAsset.name}</>
                    ) : (
                      <><LuImage /> 자산에서 시작 이미지를 선택할 수 있습니다.</>
                    )}
                  </div>
                </div>
              )}

              <button
                className={styles.generateButton}
                onClick={() => void (mode === "video" ? startVideoGeneration() : startImageGeneration())}
                disabled={generating}
              >
                {generating ? <LuLoaderCircle className={styles.spin} /> : mode === "video" ? <LuPlay /> : <LuSparkles />}
                {generating ? "작업 등록 중" : mode === "video" ? "Veo 영상 만들기" : mode === "gesture" ? "제스처 만들기" : "장면 만들기"}
              </button>
            </>
          ) : (
            <div className={styles.emptyInspector}>프로젝트와 컷을 선택하세요.</div>
          )}
        </aside>
      </div>

      {editingCut && project && selectedCut?.imageUrl && (
        <CanvasEditor
          initialImage={{ id: `cut:${selectedCut.id}`, dataUrl: selectedCut.imageUrl }}
          initialAspect={project.aspectRatio as "1:1" | "4:5" | "9:16" | "16:9"}
          galleryImages={project.assets
            .filter((asset) => asset.kind === "image")
            .map((asset) => ({ id: asset.id, dataUrl: asset.blobUrl }))}
          projectId={project.id}
          cutId={selectedCut.id}
          onClose={() => setEditingCut(false)}
          onSave={() => {
            setEditingCut(false);
            void loadProject(project.id);
          }}
        />
      )}
    </div>
  );
}
