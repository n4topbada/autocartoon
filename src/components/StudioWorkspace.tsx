"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { uploadViaTicket } from "@/lib/client-upload";
import {
  LuArrowLeft,
  LuCheck,
  LuChevronRight,
  LuClapperboard,
  LuFileText,
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
  LuCopy,
  LuArrowUp,
  LuArrowDown,
  LuDownload,
  LuStar,
  LuBookOpen,
  LuLink2,
} from "react-icons/lu";
import { PROJECT_BRIEF_TEMPLATE } from "@/lib/project-brief";
import { AI_CREDIT_COSTS, getGenerationCreditCost } from "@/lib/credit-products";
import { useAuth } from "./AuthProvider";
import CreditCostBadge from "./CreditCostBadge";
import GenerationNotifications from "./GenerationNotifications";
import {
  buildStudioGenerationPrompt,
  CAMERA_ANGLES,
  DEFAULT_STUDIO_SCENE,
  normalizeStudioSceneSettings,
  type StudioSceneSettings,
} from "@/lib/studio-scene";
import styles from "./StudioWorkspace.module.css";

const CanvasEditor = dynamic(() => import("./CanvasEditor"), { ssr: false });
const BLANK_CANVAS_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type StudioMode = "scene" | "gesture" | "video";
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

interface ProjectSummary {
  id: string;
  title: string;
  aspectRatio: string;
  updatedAt: string;
  cuts: ProjectCut[];
  _count: { cuts: number; assets: number; jobs: number };
  coverCutId?: string | null;
  coverCut?: Pick<ProjectCut, "id" | "imageUrl" | "thumbnailUrl"> | null;
}

interface ProjectCut {
  id: string;
  order: number;
  title: string;
  durationMs: number;
  prompt: string;
  negativePrompt: string | null;
  dialogue: string | null;
  dialoguePlan: unknown;
  speakerPresetId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  scene: unknown;
  canvas: unknown;
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
  cutId: string | null;
  creditCost?: number;
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
  voiceConfig?: Array<{ label: string; voiceId: string }> | null;
  images: CharacterImage[];
  representativeImage: CharacterImage | null;
}

interface SavedBrief {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface VideoDialogue {
  id: string;
  text: string;
  speakerPresetId: string | null;
}

function dialoguesForCut(cut: ProjectCut): VideoDialogue[] {
  if (Array.isArray(cut.dialoguePlan)) {
    const items = cut.dialoguePlan.flatMap((item, index): VideoDialogue[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text : "";
      if (!text.trim()) return [];
      return [{
        id: typeof record.id === "string" ? record.id : `dialogue_${index}`,
        text,
        speakerPresetId: typeof record.speakerPresetId === "string" ? record.speakerPresetId : null,
      }];
    });
    if (items.length > 0) return items;
  }
  return cut.dialogue?.trim()
    ? [{ id: `dialogue_${cut.id}`, text: cut.dialogue, speakerPresetId: cut.speakerPresetId }]
    : [];
}

interface CutDraft {
  title: string;
  prompt: string;
  negativePrompt: string;
  dialogue: string;
  durationMs: number;
  scene: StudioSceneSettings;
}

const EMPTY_DRAFT: CutDraft = {
  title: "",
  prompt: "",
  negativePrompt: "",
  dialogue: "",
  durationMs: 5000,
  scene: {
    ...DEFAULT_STUDIO_SCENE,
    characterDirections: {},
    characterPresetIds: [],
    referenceAssetIds: [],
  },
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

export default function StudioWorkspace({ initialMode = "scene" }: { initialMode?: StudioMode }) {
  const { user: authUser } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [characters, setCharacters] = useState<CharacterPreset[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CutDraft>(EMPTY_DRAFT);
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftDirty, setDraftDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(true);
  const [editingCut, setEditingCut] = useState(false);
  const [briefDialogOpen, setBriefDialogOpen] = useState(false);
  const [briefTitle, setBriefTitle] = useState("");
  const [briefMarkdown, setBriefMarkdown] = useState(PROJECT_BRIEF_TEMPLATE);
  const [briefAspectRatio, setBriefAspectRatio] = useState<"1:1" | "4:5" | "3:4" | "8:11" | "9:16" | "16:9">("4:5");
  const [briefCharacterIds, setBriefCharacterIds] = useState<string[]>([]);
  const [briefAutoGenerate, setBriefAutoGenerate] = useState(true);
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefProgress, setBriefProgress] = useState("");
  const [briefLibraryOpen, setBriefLibraryOpen] = useState(false);
  const [briefLibraryLoading, setBriefLibraryLoading] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefImporting, setBriefImporting] = useState(false);
  const [briefImportNotice, setBriefImportNotice] = useState<string | null>(null);
  const [briefUrl, setBriefUrl] = useState("");
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [videoPlanOpen, setVideoPlanOpen] = useState(false);
  const [videoPlanDrafts, setVideoPlanDrafts] = useState<Record<string, VideoDialogue[]>>({});
  const [videoPlanAnalyzing, setVideoPlanAnalyzing] = useState(false);
  const [videoPlanSaving, setVideoPlanSaving] = useState(false);
  const [videoBatchStarting, setVideoBatchStarting] = useState(false);
  const [previewingDialogueId, setPreviewingDialogueId] = useState<string | null>(null);
  const [videoOptions, setVideoOptions] = useState({
    aspectRatio: "9:16" as "9:16" | "16:9",
    durationSeconds: 8 as 4 | 6 | 8,
    resolution: "720p" as "720p" | "1080p",
    generateAudio: true,
  });
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const briefFileRef = useRef<HTMLInputElement>(null);
  const briefImageRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (loading) return;
    const validIds = new Set(characters.map((character) => character.id));
    setSelectedCharacterIds((current) => current.filter((id) => validIds.has(id)));
  }, [characters, loading]);

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
    setProjects((current) => current
      .map((item) => item.id === data.project.id
        ? {
            ...item,
            title: data.project.title,
            aspectRatio: data.project.aspectRatio,
            updatedAt: data.project.updatedAt,
            coverCutId: data.project.coverCutId,
            coverCut: data.project.coverCut,
            cuts: data.project.cuts.slice(0, 1),
            _count: {
              cuts: data.project.cuts.length,
              assets: data.project.assets.length,
              jobs: data.project.jobs.length,
            },
          }
        : item
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    );
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
        const search = new URLSearchParams(window.location.search);
        const requestedProjectId = search.get("project");
        const targetProject = items.find((item) => item.id === requestedProjectId) || items[0];
        const loaded = await loadProject(targetProject.id);
        const requestedCutId = search.get("cut");
        if (requestedCutId && loaded.cuts.some((cut) => cut.id === requestedCutId)) {
          setSelectedCutId(requestedCutId);
        }
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
    const scene = normalizeStudioSceneSettings(selectedCut.scene);
    setSelectedCharacterIds(scene.characterPresetIds);
    setDraft({
      title: selectedCut.title,
      prompt: selectedCut.prompt,
      negativePrompt: selectedCut.negativePrompt || "",
      dialogue: selectedCut.dialogue || "",
      durationMs: selectedCut.durationMs,
      scene,
    });
    setDraftDirty(false);
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
          body: JSON.stringify({ title: `새 프로젝트 ${projects.length + 1}`, aspectRatio: "4:5" }),
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

  const openBriefDialog = () => {
    setBriefCharacterIds((current) => {
      if (current.length > 0) return current;
      if (selectedCharacterIds.length > 0) return selectedCharacterIds;
      return characters[0] ? [characters[0].id] : [];
    });
    setBriefDialogOpen(true);
  };

  const loadSavedBriefs = async () => {
    setBriefLibraryLoading(true);
    try {
      const data = await readJson<{ briefs: SavedBrief[] }>(
        await fetch("/api/studio/briefs", { cache: "no-store" })
      );
      setSavedBriefs(data.briefs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장된 기획서를 불러오지 못했습니다.");
    } finally {
      setBriefLibraryLoading(false);
    }
  };

  const toggleBriefLibrary = () => {
    const next = !briefLibraryOpen;
    setBriefLibraryOpen(next);
    if (next) void loadSavedBriefs();
  };

  const saveCurrentBrief = async () => {
    if (!briefMarkdown.trim()) return;
    setBriefSaving(true);
    try {
      const data = await readJson<{ brief: SavedBrief }>(
        await fetch("/api/studio/briefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: briefTitle, content: briefMarkdown }),
        })
      );
      setBriefTitle(data.brief.title);
      setSavedBriefs((current) => [data.brief, ...current]);
      setBriefLibraryOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기획서를 저장하지 못했습니다.");
    } finally {
      setBriefSaving(false);
    }
  };

  const importBriefFile = async (file: File | null) => {
    if (!file) return;
    setBriefImporting(true);
    setBriefImportNotice(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await readJson<{
        title: string;
        content: string;
        sourceFiles: string[];
        truncated: boolean;
      }>(await fetch("/api/studio/briefs/import", { method: "POST", body: form }));
      setBriefTitle(result.title);
      setBriefMarkdown(result.content);
      setBriefImportNotice(
        `${result.sourceFiles.length}개 문서를 불러왔습니다.${result.truncated ? " 20,000자까지만 반영했습니다." : ""}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기획 자료를 읽지 못했습니다.");
    } finally {
      setBriefImporting(false);
      if (briefFileRef.current) briefFileRef.current.value = "";
    }
  };

  const importBriefImage = async (file: File | null) => {
    if (!file) return;
    setBriefImporting(true);
    setBriefImportNotice(null);
    setError(null);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
        throw new Error("이미지 OCR은 4MB 이하 PNG, JPG, WEBP 파일을 사용해주세요.");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const result = await readJson<{ text: string }>(await fetch("/api/studio/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: { base64, mimeType: file.type } }),
      }));
      if (!result.text.trim()) throw new Error("이미지에서 읽을 수 있는 글자를 찾지 못했습니다.");
      setBriefTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "이미지 기획서");
      setBriefMarkdown(result.text.trim().slice(0, 20_000));
      setBriefImportNotice(`이미지에서 글자를 추출했습니다. ${AI_CREDIT_COSTS.ocr}크레딧을 사용했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지에서 글자를 추출하지 못했습니다.");
    } finally {
      setBriefImporting(false);
      if (briefImageRef.current) briefImageRef.current.value = "";
    }
  };

  const importBriefUrl = async () => {
    const url = briefUrl.trim();
    if (!url) return;
    setBriefImporting(true);
    setBriefImportNotice(null);
    setError(null);
    try {
      const result = await readJson<{
        title: string;
        content: string;
        sourceFiles: string[];
        sourceUrl: string;
        truncated: boolean;
      }>(await fetch("/api/studio/briefs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }));
      setBriefTitle(result.title);
      setBriefMarkdown(result.content);
      setBriefUrl(result.sourceUrl);
      setBriefImportNotice(
        `공개 URL 자료를 불러왔습니다.${result.truncated ? " 20,000자까지만 반영했습니다." : ""}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "URL 자료를 읽지 못했습니다.");
    } finally {
      setBriefImporting(false);
    }
  };

  const loadSavedBrief = (brief: SavedBrief) => {
    setBriefTitle(brief.title);
    setBriefMarkdown(brief.content);
    setBriefLibraryOpen(false);
  };

  const deleteSavedBrief = async (briefId: string) => {
    try {
      await readJson(await fetch(`/api/studio/briefs/${briefId}`, { method: "DELETE" }));
      setSavedBriefs((current) => current.filter((brief) => brief.id !== briefId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기획서를 삭제하지 못했습니다.");
    }
  };

  const toggleBriefCharacter = (id: string) => {
    setBriefCharacterIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return current.length >= 4 ? current : [...current, id];
    });
  };

  const createProjectFromBrief = async () => {
    if (!briefMarkdown.trim() || briefCharacterIds.length === 0) return;
    setBriefGenerating(true);
    setError(null);
    try {
      const data = await readJson<{ project: StudioProject }>(
        await fetch("/api/studio/projects/from-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: briefTitle,
            brief: briefMarkdown,
            aspectRatio: briefAspectRatio,
            characterPresetIds: briefCharacterIds,
          }),
        })
      );
      await loadProjects();
      let queued = 0;
      const failures: string[] = [];
      if (briefAutoGenerate) {
        const briefCharacters = characters.filter((character) => briefCharacterIds.includes(character.id));
        for (const [index, cut] of data.project.cuts.entries()) {
          setBriefProgress(`컷 이미지 작업 등록 ${index + 1}/${data.project.cuts.length}`);
          const scene = normalizeStudioSceneSettings(cut.scene);
          const prompt = buildStudioGenerationPrompt({
            prompt: cut.prompt,
            mode: "scene",
            settings: scene,
            characters: briefCharacters.map((character) => ({ id: character.id, name: character.name })),
          });
          try {
            await readJson(await fetch("/api/generate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": `brief-${data.project.id}-${cut.id}`,
              },
              body: JSON.stringify({
                presetIds: briefCharacterIds,
                mode: "text",
                aspectRatio: data.project.aspectRatio === "3:4" || data.project.aspectRatio === "8:11"
                  ? "4:5"
                  : data.project.aspectRatio,
                imageSize,
                jobKind: "image",
                prompt,
                projectId: data.project.id,
                cutId: cut.id,
              }),
            }));
            queued += 1;
          } catch (reason) {
            failures.push(reason instanceof Error ? reason.message : `${index + 1}번 컷 등록 실패`);
          }
        }
      }
      await loadProject(data.project.id);
      setSelectedCharacterIds(briefCharacterIds);
      setBriefDialogOpen(false);
      setBriefLibraryOpen(false);
      if (failures.length > 0) {
        setError(`${queued}개 컷은 생성 대기열에 등록했고 ${failures.length}개는 등록하지 못했습니다. ${failures[0]}`);
      } else if (briefAutoGenerate && "Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기획서 자동 생성 실패");
    } finally {
      setBriefProgress("");
      setBriefGenerating(false);
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

  const duplicateCut = async () => {
    if (!project || !selectedCut) return;
    try {
      const data = await readJson<{ cut: ProjectCut }>(await fetch(`/api/studio/projects/${project.id}/cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCutId: selectedCut.id }),
      }));
      await loadProject(project.id);
      setSelectedCutId(data.cut.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "컷 복제 실패");
    }
  };

  const moveCut = async (direction: "up" | "down") => {
    if (!project || !selectedCut) return;
    const currentIndex = project.cuts.findIndex((cut) => cut.id === selectedCut.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= project.cuts.length) return;
    const next = [...project.cuts];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setProject((current) => current ? { ...current, cuts: next.map((cut, order) => ({ ...cut, order })) } : current);
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}/cuts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((cut) => cut.id) }),
      }));
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "컷 순서 저장 실패");
      await loadProject(project.id);
    }
  };

  const setCoverCut = async (cutId = selectedCut?.id) => {
    if (!project || !cutId) return;
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverCutId: cutId }),
      }));
      await Promise.all([loadProject(project.id), loadProjects()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "표지 지정 실패");
    }
  };

  const renameCut = async (cutId: string, title: string) => {
    if (!project) return;
    try {
      const data = await readJson<{ cut: ProjectCut }>(await fetch(`/api/studio/cuts/${cutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }));
      setProject((current) => current
        ? { ...current, cuts: current.cuts.map((cut) => cut.id === data.cut.id ? data.cut : cut) }
        : current
      );
      if (cutId === selectedCut?.id) {
        setDraft((current) => ({ ...current, title: data.cut.title }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "페이지 이름 변경 실패");
    }
  };

  const downloadBlob = async (url: string, filename: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("이미지를 내려받지 못했습니다.");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadCurrentCut = async () => {
    if (!selectedCut?.imageUrl) return;
    try {
      await downloadBlob(selectedCut.imageUrl, `${String(selectedCut.order + 1).padStart(2, "0")}-${selectedCut.title}.png`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지 다운로드 실패");
    }
  };

  const downloadAllCuts = async () => {
    if (!project) return;
    const imageCuts = project.cuts.filter((cut) => cut.imageUrl);
    if (imageCuts.length === 0) {
      setError("다운로드할 컷 이미지가 없습니다.");
      return;
    }
    setExportingZip(true);
    setError(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      await Promise.all(imageCuts.map(async (cut) => {
        const response = await fetch(cut.imageUrl!);
        if (!response.ok) throw new Error(`${cut.title} 이미지를 불러오지 못했습니다.`);
        zip.file(`${String(cut.order + 1).padStart(2, "0")}-${cut.title.replace(/[\\/:*?"<>|]/g, "-")}.png`, await response.blob());
      }));
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const objectUrl = URL.createObjectURL(archive);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${project.title.replace(/[\\/:*?"<>|]/g, "-")}.zip`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ZIP 내보내기 실패");
    } finally {
      setExportingZip(false);
    }
  };

  const saveCut = useCallback(async () => {
    if (!project || !selectedCut) return false;
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
      setDraftDirty(false);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : "컷 저장 실패");
      return false;
    }
  }, [draft, project, selectedCut]);

  useEffect(() => {
    // 저장 실패(error) 상태에서는 자동 재시도를 멈춘다. 계속 재시도하면 1초마다
    // 무한 PATCH가 발생하고 사용자가 현재 컷에 갇힌다. 다음 편집(=idle 전환)이나
    // 수동 이동 시 다시 저장을 시도한다.
    if (!draftDirty || !selectedCut || saveState === "saving" || saveState === "error") return;
    const timer = window.setTimeout(() => void saveCut(), 1_000);
    return () => window.clearTimeout(timer);
  }, [draftDirty, saveCut, saveState, selectedCut]);

  const selectCut = useCallback(async (cutId: string) => {
    if (cutId === selectedCut?.id || saveState === "saving") return;
    if (draftDirty && !(await saveCut())) return;
    setSelectedCutId(cutId);
  }, [draftDirty, saveCut, saveState, selectedCut?.id]);

  const selectProject = useCallback(async (projectId: string) => {
    if (projectId === project?.id || saveState === "saving") return;
    if (draftDirty && !(await saveCut())) return;
    await loadProject(projectId);
  }, [draftDirty, loadProject, project?.id, saveCut, saveState]);

  useEffect(() => {
    if (editingCut || !project || !selectedCut) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const currentIndex = project.cuts.findIndex((cut) => cut.id === selectedCut.id);
      const nextIndex = event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
      const nextCut = project.cuts[nextIndex];
      if (!nextCut) return;
      event.preventDefault();
      void selectCut(nextCut.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingCut, project, selectCut, selectedCut]);

  const updateDraft = <K extends keyof CutDraft>(key: K, value: CutDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDraftDirty(true);
    setSaveState("idle");
  };

  const toggleCharacter = (id: string) => {
    setSelectedCharacterIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 4 ? current : [...current, id];
      setDraft((draftState) => ({
        ...draftState,
        scene: { ...draftState.scene, characterPresetIds: next },
      }));
      setDraftDirty(true);
      setSaveState("idle");
      return next;
    });
  };

  const updateScene = <K extends keyof StudioSceneSettings>(key: K, value: StudioSceneSettings[K]) => {
    setDraft((current) => ({
      ...current,
      scene: { ...current.scene, [key]: value },
    }));
    setDraftDirty(true);
    setSaveState("idle");
  };

  const updateCharacterDirection = (characterId: string, direction: string) => {
    updateScene("characterDirections", {
      ...draft.scene.characterDirections,
      [characterId]: direction,
    });
  };

  const toggleReferenceAsset = (assetId: string) => {
    const current = draft.scene.referenceAssetIds;
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : current.length >= 3 ? current : [...current, assetId];
    updateScene("referenceAssetIds", next);
  };

  // 4면 분류(PresetImage.view)는 소유자 또는 관리자만 저장할 수 있다.
  // 구매/시스템(마켓) 프리셋에 대해서는 PATCH가 404를 반환하므로 UI에서 막는다.
  const canEditPresetViews = (character: CharacterPreset) =>
    authUser?.role === "admin" ||
    (Boolean(character.userId) && character.userId === authUser?.id);

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
    const hasGestureReference = mode === "gesture" && draft.scene.referenceAssetIds.length > 0;
    if (!project || !selectedCut || (!hasGestureReference && selectedCharacterIds.length === 0) || !draft.prompt.trim()) {
      setError(mode === "gesture"
        ? "캐릭터 프리셋 또는 참고 이미지와 제스처 프롬프트를 선택하세요."
        : "캐릭터와 장면 프롬프트를 선택하세요.");
      return;
    }
    const hasTwoUploadedCharacters = selectedCharacterIds.length === 0 && draft.scene.referenceAssetIds.length >= 2;
    if (
      mode === "gesture" &&
      draft.scene.gestureLayout === "two" &&
      selectedCharacterIds.length !== 2 &&
      !hasTwoUploadedCharacters
    ) {
      setError("2캐릭터 장면은 프리셋 2명 또는 참고 이미지 2장 이상이 필요합니다.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await saveCut();
      const prompt = buildStudioGenerationPrompt({
        prompt: draft.prompt,
        mode: mode === "gesture" ? "gesture" : "scene",
        settings: draft.scene,
        characters: selectedCharacters.map((character) => ({ id: character.id, name: character.name })),
      });
      await readJson(await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          presetIds: selectedCharacterIds,
          mode: "text",
          aspectRatio: project.aspectRatio === "3:4" || project.aspectRatio === "8:11"
            ? "4:5"
            : project.aspectRatio,
          imageSize,
          jobKind: mode === "gesture" ? "gesture" : "image",
          prompt,
          projectId: project.id,
          cutId: selectedCut.id,
          referenceAssetIds: draft.scene.referenceAssetIds,
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

  const openVideoPlan = () => {
    if (!project) return;
    setVideoPlanDrafts(Object.fromEntries(project.cuts.map((cut) => [cut.id, dialoguesForCut(cut)])));
    setVideoPlanOpen(true);
  };

  const analyzeVideoPlan = async () => {
    if (!project) return;
    setVideoPlanAnalyzing(true);
    setError(null);
    try {
      // 먼저 다이얼로그 초안(videoPlanDrafts)을 저장해야 서버가 최신 대사를 분석한다.
      // (saveCut은 선택된 컷의 워크스페이스 초안만 저장하므로 대사 분석에는 무의미)
      const persisted = await saveVideoPlan();
      if (!persisted) return;
      const data = await readJson<{ plan: Array<{ cutId: string; dialogues: VideoDialogue[] }> }>(
        await fetch(`/api/studio/projects/${project.id}/video-plan`, { method: "POST" })
      );
      // 반환된 컷만 덮어쓰고, 모델이 빠뜨린 컷의 직접 입력 대사는 보존한다.
      setVideoPlanDrafts((current) => ({
        ...current,
        ...Object.fromEntries(data.plan.map((item) => [item.cutId, item.dialogues])),
      }));
      await loadProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "영상 대사 분석 실패");
    } finally {
      setVideoPlanAnalyzing(false);
    }
  };

  const updateVideoDialogue = (cutId: string, dialogueId: string, updates: Partial<VideoDialogue>) => {
    setVideoPlanDrafts((current) => ({
      ...current,
      [cutId]: (current[cutId] || []).map((dialogue) => dialogue.id === dialogueId ? { ...dialogue, ...updates } : dialogue),
    }));
  };

  const addVideoDialogue = (cutId: string) => {
    setVideoPlanDrafts((current) => ({
      ...current,
      [cutId]: [
        ...(current[cutId] || []),
        { id: `dialogue_${crypto.randomUUID()}`, text: "", speakerPresetId: null },
      ].slice(0, 12),
    }));
  };

  const removeVideoDialogue = (cutId: string, dialogueId: string) => {
    setVideoPlanDrafts((current) => ({
      ...current,
      [cutId]: (current[cutId] || []).filter((dialogue) => dialogue.id !== dialogueId),
    }));
  };

  const moveVideoDialogue = (cutId: string, index: number, direction: "up" | "down") => {
    setVideoPlanDrafts((current) => {
      const dialogues = [...(current[cutId] || [])];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= dialogues.length) return current;
      [dialogues[index], dialogues[target]] = [dialogues[target], dialogues[index]];
      return { ...current, [cutId]: dialogues };
    });
  };

  const saveVideoPlan = async (): Promise<boolean> => {
    if (!project) return false;
    setVideoPlanSaving(true);
    setError(null);
    try {
      const results = await Promise.allSettled(project.cuts.map(async (cut) => {
        const dialogues = (videoPlanDrafts[cut.id] || []).filter((dialogue) => dialogue.text.trim());
        return readJson(await fetch(`/api/studio/cuts/${cut.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dialoguePlan: dialogues,
            dialogue: dialogues.map((dialogue) => dialogue.text.trim()).join("\n"),
            speakerPresetId: dialogues[0]?.speakerPresetId || "",
          }),
        }));
      }));
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        setError(`대사 저장 중 ${failed.length}개 컷을 저장하지 못했습니다. 다시 시도해주세요.`);
        return false;
      }
      await loadProject(project.id);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "대사 저장에 실패했습니다.");
      return false;
    } finally {
      setVideoPlanSaving(false);
    }
  };

  const previewPlannedDialogue = async (dialogue: VideoDialogue) => {
    const character = characters.find((item) => item.id === dialogue.speakerPresetId);
    const voiceId = character?.voiceConfig?.[0]?.voiceId;
    if (!voiceId || !dialogue.text.trim()) {
      setError("화자 캐릭터의 음성을 먼저 설정해주세요.");
      return;
    }
    setPreviewingDialogueId(dialogue.id);
    setError(null);
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, text: dialogue.text.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "음성을 생성하지 못했습니다.");
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewingDialogueId(null); };
      await audio.play();
    } catch (reason) {
      setPreviewingDialogueId(null);
      setError(reason instanceof Error ? reason.message : "음성 미리듣기 실패");
    }
  };

  const startProjectVideos = async () => {
    if (!project) return;
    const eligibleCuts = project.cuts.filter((cut) => cut.prompt.trim());
    if (eligibleCuts.length === 0) {
      setError("영상으로 만들 컷 프롬프트가 없습니다.");
      return;
    }
    setVideoBatchStarting(true);
    setError(null);
    try {
      // 대사 저장이 실패하면(부분 저장 위험) 유료 영상 작업을 시작하지 않는다.
      if (!(await saveVideoPlan())) return;
      const failures: string[] = [];
      for (const cut of eligibleCuts) {
        if (project.jobs.some((job) => job.kind === "video" && job.cutId === cut.id && ["queued", "running"].includes(job.status))) continue;
        const dialogues = (videoPlanDrafts[cut.id] || []).filter((dialogue) => dialogue.text.trim());
        const dialogueDirection = dialogues.length > 0
          ? `\n\n[한국어 대사 및 음성 연출]\n${dialogues.map((dialogue) => {
              const speaker = characters.find((character) => character.id === dialogue.speakerPresetId)?.name || "내레이터";
              return `${speaker}: ${dialogue.text.trim()}`;
            }).join("\n")}`
          : "";
        const sourceAsset = project.assets.find((asset) => asset.kind === "image" && asset.blobUrl === cut.imageUrl);
        try {
          await readJson(await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({
              kind: "video",
              projectId: project.id,
              cutId: cut.id,
              prompt: cut.prompt + dialogueDirection,
              negativePrompt: cut.negativePrompt || undefined,
              sourceAssetId: sourceAsset?.id,
              ...videoOptions,
            }),
          }));
        } catch {
          failures.push(cut.title);
        }
      }
      await loadProject(project.id);
      if (failures.length > 0) throw new Error(`${failures.join(", ")} 영상 작업을 시작하지 못했습니다.`);
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      setVideoPlanOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 영상 작업 시작 실패");
    } finally {
      setVideoBatchStarting(false);
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
    const existingAssetIds = new Set(project.assets.map((asset) => asset.id));
    setUploading(true);
    setError(null);
    try {
      // 티켓 발급 → 스토리지 직접 업로드 → confirm(동기적으로 ProjectAsset 생성).
      for (const file of Array.from(files)) {
        const contentType = file.type || "application/octet-stream";
        const ref = await uploadViaTicket({
          signEndpoint: "/api/studio/assets/upload",
          file,
          filename: file.name,
          contentType,
          meta: { projectId: project.id, contentType },
        });
        await readJson(await fetch("/api/studio/assets/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref, projectId: project.id, name: file.name }),
        }));
      }
      // confirm이 동기적으로 자산을 만들므로 한 번의 재조회로 즉시 반영된다.
      const refreshed = await loadProject(project.id);
      if (mode === "gesture") {
        const addedImageIds = refreshed.assets
          .filter((asset) => asset.kind === "image" && !existingAssetIds.has(asset.id))
          .map((asset) => asset.id)
          .slice(0, 3);
        if (addedImageIds.length > 0) {
          setDraft((current) => ({
            ...current,
            scene: {
              ...current.scene,
              referenceAssetIds: Array.from(new Set([
                ...current.scene.referenceAssetIds,
                ...addedImageIds,
              ])).slice(0, 3),
            },
          }));
          setDraftDirty(true);
          setSaveState("idle");
        }
      }
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
          <GenerationNotifications />
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
            <div className={styles.panelActions}>
              <button className={styles.smallIconButton} onClick={openBriefDialog} title="기획서로 자동 생성">
                <LuFileText />
              </button>
              <button className={styles.smallIconButton} onClick={() => void createProject()} disabled={creating} title="새 프로젝트">
                {creating ? <LuLoaderCircle className={styles.spin} /> : <LuPlus />}
              </button>
            </div>
          </div>
          <div className={styles.projectList}>
            {projects.map((item) => (
              <button
                key={item.id}
                className={`${styles.projectItem} ${project?.id === item.id ? styles.projectItemActive : ""}`}
                onClick={() => void selectProject(item.id)}
              >
                <span className={styles.projectThumb}>
                  {item.coverCut?.thumbnailUrl || item.coverCut?.imageUrl || item.cuts[0]?.thumbnailUrl || item.cuts[0]?.imageUrl ? (
                    <img src={item.coverCut?.thumbnailUrl || item.coverCut?.imageUrl || item.cuts[0]?.thumbnailUrl || item.cuts[0]?.imageUrl || ""} alt="" />
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
                <span><LuClapperboard /> 페이지</span>
                <button className={styles.smallIconButton} onClick={() => void addCut()} title="새 컷">
                  <LuPlus />
                </button>
              </div>
              <div className={styles.cutList}>
                {project.cuts.map((cut) => (
                  <button
                    key={cut.id}
                    className={`${styles.cutItem} ${selectedCut?.id === cut.id ? styles.cutItemActive : ""}`}
                    onClick={() => void selectCut(cut.id)}
                  >
                    <span className={styles.cutThumb}>
                      {cut.thumbnailUrl || cut.imageUrl
                        ? <img src={cut.thumbnailUrl || cut.imageUrl || ""} alt="" />
                        : <span>{String(cut.order + 1).padStart(2, "0")}</span>}
                    </span>
                    <div>
                      <strong>{cut.title}</strong>
                      <small>{(cut.durationMs / 1000).toFixed(0)}초</small>
                    </div>
                    <span className={styles.cutIndicators}>
                      {project.coverCutId === cut.id && <LuStar className={styles.coverStar} />}
                      {cut.videoUrl ? <LuVideo /> : cut.imageUrl ? <LuImage /> : null}
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.cutActions}>
                <button onClick={() => void moveCut("up")} disabled={!selectedCut || selectedCut.order === 0} title="앞으로 이동"><LuArrowUp /></button>
                <button onClick={() => void moveCut("down")} disabled={!selectedCut || selectedCut.order === project.cuts.length - 1} title="뒤로 이동"><LuArrowDown /></button>
                <button onClick={() => void duplicateCut()} disabled={!selectedCut || project.cuts.length >= 30} title="페이지 복제"><LuCopy /></button>
                <button onClick={() => void setCoverCut()} disabled={!selectedCut} title="표지 지정" className={project.coverCutId === selectedCut?.id ? styles.cutActionActive : ""}><LuStar /></button>
                <button onClick={() => void downloadCurrentCut()} disabled={!selectedCut?.imageUrl} title="현재 PNG 다운로드"><LuDownload /></button>
                <button onClick={() => void downloadAllCuts()} disabled={exportingZip || !project.cuts.some((cut) => cut.imageUrl)} title="전체 ZIP 다운로드">
                  {exportingZip ? <LuLoaderCircle className={styles.spin} /> : <LuFolderKanban />}
                </button>
                <button onClick={() => void deleteCut()} disabled={project.cuts.length <= 1} title="현재 페이지 삭제" className={styles.cutDeleteAction}><LuTrash2 /></button>
              </div>
            </>
          )}
        </aside>

        <main className={styles.stageColumn}>
          <div className={styles.modeBar} aria-label="생성 모드">
            <button
              className={mode === "scene" ? styles.modeActive : ""}
              aria-pressed={mode === "scene"}
              onClick={() => setMode("scene")}
            >
              <LuImage /> 장면
            </button>
            <button
              className={mode === "gesture" ? styles.modeActive : ""}
              aria-pressed={mode === "gesture"}
              onClick={() => setMode("gesture")}
            >
              <LuWandSparkles /> 제스처
            </button>
            <button
              className={mode === "video" ? styles.modeActive : ""}
              aria-pressed={mode === "video"}
              onClick={() => setMode("video")}
            >
              <LuVideo /> Veo 영상
            </button>
          </div>

          <div className={styles.stageArea}>
            {selectedCut && mode !== "video" && (
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

          <section
            className={`${styles.assetStrip} ${dragActive ? styles.assetStripDragging : ""}`}
            onDragOver={(event) => {
              if (!project) return;
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (project && event.dataTransfer.files?.length) {
                void uploadAssets(event.dataTransfer.files);
              }
            }}
          >
            <button className={styles.assetStripHeading} onClick={() => setAssetPanelOpen((open) => !open)}>
              <span>프로젝트 자산 {project ? project.assets.length : 0}{dragActive ? " · 여기에 놓기" : ""}</span>
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
                      <CreditCostBadge
                        credits={job.creditCost ?? getGenerationCreditCost(job.kind, job.kind.includes("video") ? videoOptions : { imageSize })}
                      />
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
                  {mode === "gesture" && (
                    <div className={styles.gestureUploadRow}>
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <LuLoaderCircle className={styles.spin} /> : <LuUpload />}
                        캐릭터·그림체 이미지 업로드
                      </button>
                      <small>업로드한 이미지는 아래 참고 자산에 자동 선택됩니다.</small>
                    </div>
                  )}
                  {mode === "gesture" && (
                    <div className={styles.segmentControl} aria-label="제스처 구성">
                      <button
                        className={draft.scene.gestureLayout === "single" ? styles.segmentActive : ""}
                        aria-pressed={draft.scene.gestureLayout === "single"}
                        onClick={() => updateScene("gestureLayout", "single")}
                      >
                        단일 제스처
                      </button>
                      <button
                        className={draft.scene.gestureLayout === "two" ? styles.segmentActive : ""}
                        aria-pressed={draft.scene.gestureLayout === "two"}
                        onClick={() => updateScene("gestureLayout", "two")}
                      >
                        2캐릭터 장면
                      </button>
                    </div>
                  )}
                  {selectedCharacters.map((character) => {
                    const editableViews = canEditPresetViews(character);
                    return (
                    <div className={styles.characterViews} key={character.id}>
                      <strong>{character.name} · 4면 참조</strong>
                      <div>
                        {character.images.map((image) => (
                          <label key={image.id}>
                            <img src={image.thumbnailUrl || image.dataUrl} alt="캐릭터 참조" />
                            <select
                              value={image.view || "reference"}
                              disabled={!editableViews}
                              title={editableViews ? undefined : "구매·시스템 캐릭터의 4면 분류는 변경할 수 없습니다."}
                              onChange={(event) => void setCharacterImageView(character.id, image.id, event.target.value)}
                            >
                              {Object.entries(VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      {(mode === "gesture" || selectedCharacters.length > 1) && (
                        <label className={styles.characterDirectionField}>
                          <span>{character.name} 표정·포즈</span>
                          <input
                            value={draft.scene.characterDirections[character.id] || ""}
                            onChange={(event) => updateCharacterDirection(character.id, event.target.value)}
                            placeholder="예: 따뜻하게 설명하며 오른손을 든다"
                          />
                        </label>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}

              {mode !== "video" && (
                <div className={styles.inspectorSection}>
                  <div className={styles.sectionTitleRow}>
                    <h2>연출 설정</h2>
                    <span>참고 {draft.scene.referenceAssetIds.length}/3</span>
                  </div>
                  <label className={styles.field}>
                    <span>카메라 앵글</span>
                    <select
                      value={draft.scene.cameraAngle}
                      onChange={(event) => updateScene("cameraAngle", event.target.value as StudioSceneSettings["cameraAngle"])}
                    >
                      {CAMERA_ANGLES.map((angle) => (
                        <option key={angle.id} value={angle.id}>{angle.label} · {angle.description}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.field}>
                    <span>배경</span>
                    <div className={styles.segmentControl} aria-label="배경 포함 여부">
                      <button
                        className={draft.scene.backgroundMode === "scene" ? styles.segmentActive : ""}
                        onClick={() => updateScene("backgroundMode", "scene")}
                      >
                        배경 있음
                      </button>
                      <button
                        className={draft.scene.backgroundMode === "none" ? styles.segmentActive : ""}
                        onClick={() => updateScene("backgroundMode", "none")}
                      >
                        배경 없음
                      </button>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <span>출력 품질</span>
                    <div className={styles.segmentControl} aria-label="이미지 출력 품질">
                      <button
                        className={imageSize === "1K" ? styles.segmentActive : ""}
                        onClick={() => setImageSize("1K")}
                        aria-pressed={imageSize === "1K"}
                      >
                        빠른 1K
                      </button>
                      <button
                        className={imageSize === "2K" ? styles.segmentActive : ""}
                        onClick={() => setImageSize("2K")}
                        aria-pressed={imageSize === "2K"}
                      >
                        고품질 2K
                      </button>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <span>구도·분위기 참고 자산</span>
                    <div className={styles.referenceAssetGrid}>
                      {project?.assets.filter((asset) => asset.kind === "image").map((asset) => {
                        const selected = draft.scene.referenceAssetIds.includes(asset.id);
                        return (
                          <button
                            key={asset.id}
                            className={selected ? styles.referenceAssetActive : ""}
                            onClick={() => toggleReferenceAsset(asset.id)}
                            aria-pressed={selected}
                            title={asset.name}
                          >
                            <img src={asset.thumbnailUrl || asset.blobUrl} alt="" />
                            {selected && <LuCheck />}
                          </button>
                        );
                      })}
                      {!project?.assets.some((asset) => asset.kind === "image") && (
                        <small className={styles.emptyReferences}>프로젝트 자산에 이미지를 올리면 참고로 선택할 수 있습니다.</small>
                      )}
                    </div>
                  </div>
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
                  <button className={styles.videoPlanButton} onClick={openVideoPlan}>
                    <LuFileText /> 프로젝트 전체 대사·영상 구성
                  </button>
                </div>
              )}

              <button
                className={styles.generateButton}
                onClick={() => void (mode === "video" ? startVideoGeneration() : startImageGeneration())}
                disabled={generating}
              >
                {generating ? <LuLoaderCircle className={styles.spin} /> : mode === "video" ? <LuPlay /> : <LuSparkles />}
                {generating ? "작업 등록 중" : mode === "video" ? "Veo 영상 만들기" : mode === "gesture" ? "제스처 만들기" : "장면 만들기"}
                <CreditCostBadge
                  credits={mode === "video"
                    ? getGenerationCreditCost("video", videoOptions)
                    : getGenerationCreditCost(mode === "gesture" ? "gesture" : "image", { imageSize })}
                />
              </button>
            </>
          ) : (
            <div className={styles.emptyInspector}>프로젝트와 컷을 선택하세요.</div>
          )}
        </aside>
      </div>

      {editingCut && project && selectedCut && (
        <CanvasEditor
          key={selectedCut.id}
          initialImage={{ id: `cut:${selectedCut.id}`, dataUrl: selectedCut.imageUrl || BLANK_CANVAS_DATA_URL }}
          initialAspect={project.aspectRatio as "1:1" | "4:5" | "3:4" | "8:11" | "9:16" | "16:9"}
          galleryImages={project.assets
            .filter((asset) => asset.kind === "image")
            .map((asset) => ({ id: asset.id, dataUrl: asset.blobUrl }))}
          projectId={project.id}
          cutId={selectedCut.id}
          initialCanvas={selectedCut.canvas}
          pages={project.cuts.map((cut) => ({
            id: cut.id,
            order: cut.order,
            title: cut.title,
            imageUrl: cut.imageUrl,
            thumbnailUrl: cut.thumbnailUrl,
          }))}
          currentPageId={selectedCut.id}
          onSelectPage={selectCut}
          onAddPage={addCut}
          onDuplicatePage={duplicateCut}
          onDeletePage={deleteCut}
          onMovePage={moveCut}
          coverPageId={project.coverCutId}
          onRenamePage={renameCut}
          onSetCoverPage={setCoverCut}
          onDownloadCurrentPage={downloadCurrentCut}
          onDownloadAllPages={downloadAllCuts}
          onClose={() => setEditingCut(false)}
          onSave={() => {
            void loadProject(project.id);
          }}
        />
      )}

      {videoPlanOpen && project && (
        <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !videoPlanAnalyzing && !videoPlanSaving && !videoBatchStarting) setVideoPlanOpen(false);
        }}>
          <section className={styles.videoPlanDialog} role="dialog" aria-modal="true" aria-labelledby="video-plan-title">
            <header className={styles.dialogHeader}>
              <div>
                <span>PROJECT VIDEO</span>
                <h2 id="video-plan-title">대사·화자·컷 영상 구성</h2>
              </div>
              <button className={styles.iconButton} onClick={() => setVideoPlanOpen(false)} disabled={videoPlanAnalyzing || videoPlanSaving || videoBatchStarting} title="닫기"><LuX /></button>
            </header>

            <div className={styles.videoPlanToolbar}>
              <button onClick={() => void analyzeVideoPlan()} disabled={videoPlanAnalyzing || videoPlanSaving || videoBatchStarting}>
                {videoPlanAnalyzing ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />} AI 대사 분석
                <CreditCostBadge credits={AI_CREDIT_COSTS.videoPlan} />
              </button>
              <button onClick={() => void saveVideoPlan()} disabled={videoPlanAnalyzing || videoPlanSaving || videoBatchStarting}>
                {videoPlanSaving ? <LuLoaderCircle className={styles.spin} /> : <LuSave />} 저장
              </button>
              <button className={styles.videoBatchButton} onClick={() => void startProjectVideos()} disabled={videoPlanAnalyzing || videoPlanSaving || videoBatchStarting || !project.cuts.some((cut) => cut.prompt.trim())}>
                {videoBatchStarting ? <LuLoaderCircle className={styles.spin} /> : <LuPlay />} 전체 Veo 시작 · {project.cuts.filter((cut) => cut.prompt.trim()).length}컷
                <CreditCostBadge
                  credits={project.cuts.filter((cut) => cut.prompt.trim()).length * getGenerationCreditCost("video", videoOptions)}
                  approximate
                />
              </button>
            </div>

            {error && <div className={styles.dialogError}>{error}<button onClick={() => setError(null)} title="닫기"><LuX /></button></div>}

            <div className={styles.videoPlanBody}>
              {project.cuts.map((cut) => {
                const dialogues = videoPlanDrafts[cut.id] || [];
                return (
                  <article className={styles.videoCut} key={cut.id}>
                    <header>
                      <span>{String(cut.order + 1).padStart(2, "0")}</span>
                      {cut.thumbnailUrl || cut.imageUrl
                        ? <img src={cut.thumbnailUrl || cut.imageUrl || ""} alt="" />
                        : <div className={styles.videoCutPlaceholder}><LuImage /></div>}
                      <div>
                        <strong>{cut.title}</strong>
                        <small>{Math.round(cut.durationMs / 1000)}초 · {cut.videoUrl ? "영상 완료" : "영상 대기"}</small>
                      </div>
                      <button className={styles.smallIconButton} onClick={() => addVideoDialogue(cut.id)} disabled={dialogues.length >= 12} title="대사 추가"><LuPlus /></button>
                    </header>
                    <div className={styles.dialogueRows}>
                      {dialogues.map((dialogue, index) => (
                        <div className={styles.dialogueRow} key={dialogue.id}>
                          <div className={styles.dialogueOrder}>
                            <button onClick={() => moveVideoDialogue(cut.id, index, "up")} disabled={index === 0} title="위로"><LuArrowUp /></button>
                            <button onClick={() => moveVideoDialogue(cut.id, index, "down")} disabled={index === dialogues.length - 1} title="아래로"><LuArrowDown /></button>
                          </div>
                          <select value={dialogue.speakerPresetId || ""} onChange={(event) => updateVideoDialogue(cut.id, dialogue.id, { speakerPresetId: event.target.value || null })} aria-label="화자">
                            <option value="">내레이터</option>
                            {characters.map((character) => (
                              <option value={character.id} key={character.id}>{character.name}{character.voiceConfig?.[0] ? " · 음성" : ""}</option>
                            ))}
                          </select>
                          <textarea rows={2} value={dialogue.text} maxLength={1_000} onChange={(event) => updateVideoDialogue(cut.id, dialogue.id, { text: event.target.value })} aria-label="대사" />
                          <button onClick={() => void previewPlannedDialogue(dialogue)} disabled={previewingDialogueId === dialogue.id || !dialogue.text.trim()} title="음성 미리듣기">
                            {previewingDialogueId === dialogue.id ? <LuLoaderCircle className={styles.spin} /> : <LuVolume2 />}
                            <CreditCostBadge credits={AI_CREDIT_COSTS.tts} />
                          </button>
                          <button onClick={() => removeVideoDialogue(cut.id, dialogue.id)} title="대사 삭제"><LuTrash2 /></button>
                        </div>
                      ))}
                      {dialogues.length === 0 && (
                        <button className={styles.emptyDialogue} onClick={() => addVideoDialogue(cut.id)}><LuPlus /> 대사 추가</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {briefDialogOpen && (
        <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !briefGenerating) setBriefDialogOpen(false);
        }}>
          <section className={styles.briefDialog} role="dialog" aria-modal="true" aria-labelledby="brief-dialog-title">
            <header className={styles.dialogHeader}>
              <div>
                <span>AI 콘티</span>
                <h2 id="brief-dialog-title">기획서로 프로젝트 자동 생성</h2>
              </div>
              <button className={styles.iconButton} onClick={() => setBriefDialogOpen(false)} disabled={briefGenerating} title="닫기">
                <LuX />
              </button>
            </header>

            <div className={styles.briefDialogBody}>
              <div className={styles.briefEditorColumn}>
                <div className={styles.dialogSectionTitle}>
                  <strong>기획서 마크다운</strong>
                  <div className={styles.briefEditorActions}>
                    <input
                      ref={briefFileRef}
                      type="file"
                      accept=".pdf,.docx,.zip,.md,.markdown,.txt,.csv,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain,text/csv,text/markdown,text/html"
                      hidden
                      onChange={(event) => void importBriefFile(event.target.files?.[0] || null)}
                    />
                    <button onClick={() => briefFileRef.current?.click()} disabled={briefImporting || briefGenerating}>
                      {briefImporting ? <LuLoaderCircle className={styles.spin} /> : <LuUpload />} 자료 가져오기
                    </button>
                    <input
                      ref={briefImageRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(event) => void importBriefImage(event.target.files?.[0] || null)}
                    />
                    <button onClick={() => briefImageRef.current?.click()} disabled={briefImporting || briefGenerating}>
                      <LuImage /> 이미지 OCR <CreditCostBadge credits={AI_CREDIT_COSTS.ocr} />
                    </button>
                    <button onClick={toggleBriefLibrary}><LuBookOpen /> 저장된 기획서</button>
                    <button onClick={() => void saveCurrentBrief()} disabled={briefSaving || !briefMarkdown.trim()}>
                      {briefSaving ? <LuLoaderCircle className={styles.spin} /> : <LuSave />} 현재 저장
                    </button>
                    <button onClick={() => { setBriefTitle(""); setBriefMarkdown(PROJECT_BRIEF_TEMPLATE); }}>템플릿</button>
                  </div>
                </div>
                <div className={styles.briefUrlImport}>
                  <LuLink2 aria-hidden="true" />
                  <input
                    type="url"
                    value={briefUrl}
                    maxLength={2_048}
                    aria-label="가져올 공개 자료 URL"
                    placeholder="공개 블로그 또는 문서 URL"
                    onChange={(event) => setBriefUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void importBriefUrl();
                      }
                    }}
                  />
                  <button type="button" onClick={() => void importBriefUrl()} disabled={briefImporting || briefGenerating || !briefUrl.trim()}>
                    가져오기
                  </button>
                </div>
                <input
                  className={styles.briefTitleInput}
                  value={briefTitle}
                  onChange={(event) => setBriefTitle(event.target.value)}
                  maxLength={120}
                  placeholder="프로젝트와 저장 기획서 제목 (선택)"
                  aria-label="기획서 제목"
                />
                {briefImportNotice && <div className={styles.briefImportNotice} role="status"><LuCheck /> {briefImportNotice}</div>}
                <textarea
                  className={styles.briefTextarea}
                  value={briefMarkdown}
                  onChange={(event) => setBriefMarkdown(event.target.value)}
                  maxLength={20_000}
                  aria-label="기획서 마크다운"
                />
                <small className={styles.characterCounter}>{briefMarkdown.length.toLocaleString()} / 20,000자</small>
              </div>

              <div className={styles.briefOptionsColumn}>
                <div className={styles.dialogSectionTitle}>
                  <strong>주인공 캐릭터</strong>
                  <span>{briefCharacterIds.length}/4</span>
                </div>
                <div className={styles.briefCharacterGrid}>
                  {characters.map((character) => {
                    const image = character.representativeImage || character.images[0];
                    const selected = briefCharacterIds.includes(character.id);
                    return (
                      <button
                        key={character.id}
                        className={selected ? styles.briefCharacterActive : ""}
                        onClick={() => toggleBriefCharacter(character.id)}
                        aria-pressed={selected}
                      >
                        <span>{image ? <img src={image.thumbnailUrl || image.dataUrl} alt="" /> : <LuImage />}</span>
                        <small>{character.name}</small>
                        {selected && <LuCheck />}
                      </button>
                    );
                  })}
                </div>

                <label className={styles.field}>
                  <span>캔버스 규격</span>
                  <select value={briefAspectRatio} onChange={(event) => setBriefAspectRatio(event.target.value as typeof briefAspectRatio)}>
                    <option value="1:1">인스타 1:1 · 1080×1080</option>
                    <option value="4:5">인스타 4:5 · 1080×1350</option>
                    <option value="3:4">카드뉴스 3:4 · 960×1280</option>
                    <option value="8:11">원고 800×1100</option>
                    <option value="9:16">숏폼 9:16 · 1080×1920</option>
                    <option value="16:9">가로 16:9 · 1920×1080</option>
                  </select>
                </label>

                <div className={styles.field}>
                  <span>이미지 출력 품질</span>
                  <div className={styles.segmentControl} aria-label="기획서 이미지 출력 품질">
                    <button
                      className={imageSize === "1K" ? styles.segmentActive : ""}
                      onClick={() => setImageSize("1K")}
                      aria-pressed={imageSize === "1K"}
                    >
                      Gemini 빠른 1K
                    </button>
                    <button
                      className={imageSize === "2K" ? styles.segmentActive : ""}
                      onClick={() => setImageSize("2K")}
                      aria-pressed={imageSize === "2K"}
                    >
                      Gemini 고품질 2K
                    </button>
                  </div>
                </div>

                <label className={styles.briefAutoOption}>
                  <input
                    type="checkbox"
                    checked={briefAutoGenerate}
                    onChange={(event) => setBriefAutoGenerate(event.target.checked)}
                  />
                  <span>
                    <strong>컷 이미지까지 자동 생성</strong>
                    <small>콘티를 만든 뒤 각 컷을 생성 대기열에 자동 등록합니다.</small>
                  </span>
                </label>

                <div className={styles.platformModelNote}>
                  <LuSparkles />
                  <div>
                    <strong>플랫폼 Vertex AI</strong>
                    <span>사용자 API 키 없이 기획 분석과 컷 구성을 처리합니다.</span>
                  </div>
                </div>
              </div>
            </div>

            {briefLibraryOpen && (
              <aside className={styles.briefLibrary} aria-label="저장된 기획서">
                <header>
                  <div>
                    <strong>저장된 기획서</strong>
                    <span>{savedBriefs.length}/50</span>
                  </div>
                  <button className={styles.iconButton} onClick={() => setBriefLibraryOpen(false)} title="닫기">
                    <LuX />
                  </button>
                </header>
                <div className={styles.briefLibraryList}>
                  {briefLibraryLoading ? (
                    <div className={styles.briefLibraryEmpty}><LuLoaderCircle className={styles.spin} /> 불러오는 중</div>
                  ) : savedBriefs.length === 0 ? (
                    <div className={styles.briefLibraryEmpty}>저장된 기획서가 없습니다.</div>
                  ) : savedBriefs.map((brief) => (
                    <div className={styles.briefLibraryRow} key={brief.id}>
                      <button onClick={() => loadSavedBrief(brief)}>
                        <strong>{brief.title}</strong>
                        <span>{new Date(brief.updatedAt).toLocaleString("ko-KR")}</span>
                      </button>
                      <button onClick={() => void deleteSavedBrief(brief.id)} title="저장된 기획서 삭제">
                        <LuTrash2 />
                      </button>
                    </div>
                  ))}
                </div>
              </aside>
            )}

            <footer className={styles.dialogFooter}>
              <button className={styles.secondaryButton} onClick={() => setBriefDialogOpen(false)} disabled={briefGenerating}>취소</button>
              <button
                className={styles.primaryButton}
                onClick={() => void createProjectFromBrief()}
                disabled={briefGenerating || !briefMarkdown.trim() || briefCharacterIds.length === 0}
              >
                {briefGenerating ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />}
                {briefGenerating
                  ? briefProgress || "콘티를 구성하고 있습니다"
                  : briefAutoGenerate ? "콘티와 컷 이미지 자동 생성" : "프로젝트와 컷 자동 생성"}
                <CreditCostBadge
                  credits={AI_CREDIT_COSTS.projectBrief}
                  label={briefAutoGenerate
                    ? `${AI_CREDIT_COSTS.projectBrief} + 컷당 ${getGenerationCreditCost("image", { imageSize })}`
                    : undefined}
                />
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
