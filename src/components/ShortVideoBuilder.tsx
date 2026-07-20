"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowUp,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuClapperboard,
  LuDownload,
  LuExternalLink,
  LuFilm,
  LuFolderKanban,
  LuImagePlus,
  LuLoaderCircle,
  LuPlus,
  LuRefreshCw,
  LuRotateCcw,
  LuSparkles,
  LuTrash2,
  LuUpload,
  LuVideo,
  LuVolume2,
  LuVolumeX,
  LuX,
} from "react-icons/lu";
import { uploadViaTicket } from "@/lib/client-upload";
import { AI_CREDIT_COSTS, getGenerationCreditCost } from "@/lib/credit-products";
import CreditCostBadge from "./CreditCostBadge";
import GenerationNotifications from "./GenerationNotifications";
import styles from "./ShortVideoBuilder.module.css";

type VideoProvider = "veo" | "seedance";
type VideoResolution = "720p" | "1080p";

interface ProjectSummary {
  id: string;
  title: string;
  usableCutCount: number;
  _count: { cuts: number };
}

interface ProjectCut {
  id: string;
  order: number;
  title: string;
  durationMs: number;
  prompt: string;
  videoPrompt: string | null;
  videoProvider: string;
  videoResolution: string;
  videoGenerateAudio: boolean;
  videoApprovedAt: string | null;
  negativePrompt: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
}

interface ProjectAsset {
  id: string;
  kind: string;
  name: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  metadata: unknown;
  createdAt: string;
}

interface GenerationJob {
  id: string;
  kind: string;
  status: string;
  stage: string;
  progress: number;
  cutId: string | null;
  provider: string;
  model: string;
  error: string | null;
  creditUnits: number | null;
  input: unknown;
  createdAt: string;
  completedAt: string | null;
}

interface StudioProject {
  id: string;
  title: string;
  aspectRatio: string;
  cuts: ProjectCut[];
  assets: ProjectAsset[];
  jobs: GenerationJob[];
}

interface ProviderInfo {
  id: VideoProvider;
  label: string;
  configured: boolean;
  durations: number[];
  resolutions: VideoResolution[];
  models: Record<VideoResolution, string>;
  creditExamples: Record<string, number>;
}

interface ActiveFFmpeg {
  terminate: () => void;
}

const MAX_SCENES = 30;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (response.status === 401 && typeof window !== "undefined") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}&reason=session_expired`);
    throw new Error("로그인이 필요합니다.");
  }
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body as T;
}

function asVideoProvider(value: string): VideoProvider {
  return value === "seedance" ? "seedance" : "veo";
}

function asVideoResolution(value: string): VideoResolution {
  return value === "1080p" ? "1080p" : "720p";
}

function metadataSource(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const source = (value as Record<string, unknown>).source;
  return typeof source === "string" ? source : "";
}

function jobInput(job: GenerationJob | undefined): Record<string, unknown> {
  return job?.input && typeof job.input === "object" && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {};
}

function sceneDurationSeconds(cut: ProjectCut, providerInfo: ProviderInfo | undefined) {
  const provider = asVideoProvider(cut.videoProvider);
  const durations = providerInfo?.durations || (provider === "seedance"
    ? Array.from({ length: 12 }, (_, index) => index + 4)
    : [4, 6, 8]);
  const stored = Math.round(cut.durationMs / 1_000);
  return durations.includes(stored) ? stored : durations[0];
}

function stageLabel(job: GenerationJob | undefined) {
  if (!job) return "대기";
  if (job.status === "succeeded") return "완료";
  if (job.status === "failed") return "실패";
  if (job.status === "canceled") return "취소";
  const labels: Record<string, string> = {
    queued: "대기열",
    submitting_video: "모델 요청",
    waiting_for_video: "영상 생성",
    saving_video: "결과 저장",
  };
  return labels[job.stage] || "진행 중";
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9가-힣_-]/g, "-").slice(0, 80) || "short";
}

export default function ShortVideoBuilder() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [selectedCutId, setSelectedCutId] = useState("");
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadTargetCutId, setUploadTargetCutId] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [composeStatus, setComposeStatus] = useState("");
  const [finalResolution, setFinalResolution] = useState<VideoResolution>("720p");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFfmpegRef = useRef<ActiveFFmpeg | null>(null);
  const localOutputUrlRef = useRef<string | null>(null);

  const setCutBusy = (cutId: string, label: string | null) => {
    setBusy((current) => {
      const next = { ...current };
      if (label) next[cutId] = label;
      else delete next[cutId];
      return next;
    });
  };

  const loadProjects = useCallback(async () => {
    const data = await readJson<{ projects: ProjectSummary[] }>(
      await fetch("/api/studio/projects", { cache: "no-store" })
    );
    setProjects(data.projects);
    return data.projects;
  }, []);

  const loadProject = useCallback(async (projectId: string, quiet = false) => {
    if (!quiet) setProjectLoading(true);
    try {
      const data = await readJson<{ project: StudioProject }>(
        await fetch(`/api/studio/projects/${projectId}`, { cache: "no-store" })
      );
      setProject(data.project);
      setSelectedCutId((current) => (
        data.project.cuts.some((cut) => cut.id === current)
          ? current
          : data.project.cuts[0]?.id || ""
      ));
    } finally {
      if (!quiet) setProjectLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [projectItems, providerData] = await Promise.all([
          loadProjects(),
          readJson<{ providers: ProviderInfo[] }>(
            await fetch("/api/shorts/providers", { cache: "no-store" })
          ),
        ]);
        if (!active) return;
        setProviders(providerData.providers);
        const queryProjectId = new URLSearchParams(window.location.search).get("projectId");
        const initial = projectItems.find((item) => item.id === queryProjectId) || projectItems[0];
        if (initial) await loadProject(initial.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "숏폼 작업을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadProject, loadProjects]);

  const activeJobCount = useMemo(
    () => project?.jobs.filter((job) => job.kind === "video" && ["queued", "running"].includes(job.status)).length || 0,
    [project?.jobs]
  );

  useEffect(() => {
    if (!project?.id || activeJobCount === 0) return;
    const timer = window.setInterval(() => void loadProject(project.id, true), 4_000);
    return () => window.clearInterval(timer);
  }, [activeJobCount, loadProject, project?.id]);

  useEffect(() => () => {
    activeFfmpegRef.current?.terminate();
    if (localOutputUrlRef.current) URL.revokeObjectURL(localOutputUrlRef.current);
  }, []);

  const selectedCut = project?.cuts.find((cut) => cut.id === selectedCutId) || null;
  const imageAssets = useMemo(
    () => project?.assets.filter((asset) => asset.kind === "image").slice(0, 24) || [],
    [project?.assets]
  );
  const latestJobByCut = useMemo(() => {
    const map = new Map<string, GenerationJob>();
    for (const job of project?.jobs || []) {
      if (job.kind === "video" && job.cutId && !map.has(job.cutId)) map.set(job.cutId, job);
    }
    return map;
  }, [project?.jobs]);
  const approvedCuts = useMemo(
    () => project?.cuts.filter((cut) => Boolean(cut.videoUrl && cut.videoApprovedAt)) || [],
    [project?.cuts]
  );
  const latestFinalAsset = useMemo(
    () => project?.assets.find((asset) => asset.kind === "video" && metadataSource(asset.metadata) === "short-builder") || null,
    [project?.assets]
  );
  const displayedOutputUrl = outputUrl || latestFinalAsset?.blobUrl || null;

  const replaceCut = useCallback((cutId: string, patch: Partial<ProjectCut>) => {
    setProject((current) => current
      ? { ...current, cuts: current.cuts.map((cut) => cut.id === cutId ? { ...cut, ...patch } : cut) }
      : current
    );
  }, []);

  const patchCut = useCallback(async (cutId: string, patch: Record<string, unknown>) => {
    const data = await readJson<{ cut: ProjectCut }>(await fetch(`/api/studio/cuts/${cutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }));
    replaceCut(cutId, data.cut);
    return data.cut;
  }, [replaceCut]);

  const createProject = async () => {
    setError(null);
    try {
      const data = await readJson<{ project: StudioProject }>(await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 숏폼 프로젝트", aspectRatio: "9:16" }),
      }));
      await loadProjects();
      await loadProject(data.project.id);
      setNotice("새 숏폼 프로젝트를 만들었습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로젝트를 만들지 못했습니다.");
    }
  };

  const saveProjectTitle = async () => {
    if (!project?.title.trim()) return;
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: project.title }),
      }));
      await loadProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로젝트 제목을 저장하지 못했습니다.");
    }
  };

  const addScene = async () => {
    if (!project || project.cuts.length >= MAX_SCENES) return;
    setError(null);
    try {
      const data = await readJson<{ cut: ProjectCut }>(await fetch(`/api/studio/projects/${project.id}/cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `씬 ${project.cuts.length + 1}` }),
      }));
      setProject({ ...project, cuts: [...project.cuts, data.cut] });
      setSelectedCutId(data.cut.id);
      await loadProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "씬을 추가하지 못했습니다.");
    }
  };

  const removeScene = async (cutId: string) => {
    if (!project || !window.confirm("이 씬과 연결된 편집 내용을 삭제할까요?")) return;
    setCutBusy(cutId, "삭제 중");
    try {
      await readJson(await fetch(`/api/studio/cuts/${cutId}`, { method: "DELETE" }));
      await loadProject(project.id);
      await loadProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "씬을 삭제하지 못했습니다.");
    } finally {
      setCutBusy(cutId, null);
    }
  };

  const moveScene = async (cutId: string, direction: -1 | 1) => {
    if (!project) return;
    const index = project.cuts.findIndex((cut) => cut.id === cutId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.cuts.length) return;
    const reordered = [...project.cuts];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setProject({ ...project, cuts: reordered.map((cut, order) => ({ ...cut, order })) });
    try {
      await readJson(await fetch(`/api/studio/projects/${project.id}/cuts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((cut) => cut.id) }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "씬 순서를 저장하지 못했습니다.");
      await loadProject(project.id, true);
    }
  };

  const openUpload = (cutId: string) => {
    setUploadTargetCutId(cutId);
    fileInputRef.current?.click();
  };

  const uploadSourceImage = async (file: File | undefined) => {
    if (!file || !project || !uploadTargetCutId) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
      setError("20MB 이하 PNG, JPG, WebP 이미지를 선택하세요.");
      return;
    }
    setCutBusy(uploadTargetCutId, "이미지 업로드");
    setError(null);
    try {
      const ref = await uploadViaTicket({
        signEndpoint: "/api/studio/assets/upload",
        file,
        filename: file.name,
        contentType: file.type,
        meta: { projectId: project.id },
      });
      const data = await readJson<{ asset: ProjectAsset }>(await fetch("/api/studio/assets/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, projectId: project.id, name: file.name }),
      }));
      await patchCut(uploadTargetCutId, { sourceAssetId: data.asset.id });
      await loadProject(project.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "시작 이미지를 업로드하지 못했습니다.");
    } finally {
      setCutBusy(uploadTargetCutId, null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const selectSourceAsset = async (assetId: string) => {
    if (!selectedCut) return;
    setCutBusy(selectedCut.id, "이미지 적용");
    try {
      await patchCut(selectedCut.id, { sourceAssetId: assetId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "시작 이미지를 적용하지 못했습니다.");
    } finally {
      setCutBusy(selectedCut.id, null);
    }
  };

  const changeProvider = async (providerId: VideoProvider) => {
    if (!selectedCut) return;
    const info = providers.find((item) => item.id === providerId);
    if (!info?.configured) return;
    const currentDuration = Math.round(selectedCut.durationMs / 1_000);
    const duration = info.durations.includes(currentDuration)
      ? currentDuration
      : info.durations.includes(6) ? 6 : info.durations[0];
    replaceCut(selectedCut.id, { videoProvider: providerId, durationMs: duration * 1_000, videoApprovedAt: null });
    try {
      await patchCut(selectedCut.id, { videoProvider: providerId, durationMs: duration * 1_000 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "영상 모델을 저장하지 못했습니다.");
    }
  };

  const expandPrompt = async () => {
    if (!selectedCut?.prompt.trim()) {
      setError("간단 프롬프트를 먼저 입력하세요.");
      return;
    }
    const provider = asVideoProvider(selectedCut.videoProvider);
    const providerInfo = providers.find((item) => item.id === provider);
    const durationSeconds = sceneDurationSeconds(selectedCut, providerInfo);
    setCutBusy(selectedCut.id, "프롬프트 확장");
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<{ prompt: string; negativePrompt: string; creditCost: number }>(
        await fetch("/api/shorts/prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cutId: selectedCut.id,
            brief: selectedCut.prompt,
            provider,
            durationSeconds,
            resolution: asVideoResolution(selectedCut.videoResolution),
            generateAudio: selectedCut.videoGenerateAudio,
          }),
        })
      );
      replaceCut(selectedCut.id, {
        videoPrompt: data.prompt,
        negativePrompt: data.negativePrompt,
        videoApprovedAt: null,
      });
      setNotice(`프롬프트를 확장했습니다. ${data.creditCost}크레딧을 사용했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프롬프트를 확장하지 못했습니다.");
    } finally {
      setCutBusy(selectedCut.id, null);
    }
  };

  const generateScene = async () => {
    if (!project || !selectedCut) return;
    const provider = asVideoProvider(selectedCut.videoProvider);
    const providerInfo = providers.find((item) => item.id === provider);
    const prompt = selectedCut.videoPrompt?.trim() || selectedCut.prompt.trim();
    if (!providerInfo?.configured) {
      setError(`${providerInfo?.label || provider} 연결이 설정되지 않았습니다.`);
      return;
    }
    if (!selectedCut.imageUrl) {
      setError("씬의 시작 이미지를 먼저 선택하세요.");
      return;
    }
    if (!prompt) {
      setError("영상 프롬프트를 입력하세요.");
      return;
    }
    const durationSeconds = sceneDurationSeconds(selectedCut, providerInfo);
    setCutBusy(selectedCut.id, selectedCut.videoUrl ? "재생성 요청" : "생성 요청");
    setError(null);
    setNotice(null);
    try {
      await patchCut(selectedCut.id, {
        prompt: selectedCut.prompt,
        videoPrompt: selectedCut.videoPrompt || "",
        negativePrompt: selectedCut.negativePrompt || "",
        videoProvider: provider,
        videoResolution: asVideoResolution(selectedCut.videoResolution),
        videoGenerateAudio: selectedCut.videoGenerateAudio,
        durationMs: durationSeconds * 1_000,
      });
      const data = await readJson<{ job: GenerationJob }>(await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `short-${selectedCut.id}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          kind: "video",
          projectId: project.id,
          cutId: selectedCut.id,
          provider,
          prompt,
          negativePrompt: selectedCut.negativePrompt,
          aspectRatio: "9:16",
          durationSeconds,
          resolution: asVideoResolution(selectedCut.videoResolution),
          generateAudio: selectedCut.videoGenerateAudio,
        }),
      }));
      setNotice(`${providerInfo.label} 씬 생성을 시작했습니다. 완료되면 알림으로 알려드립니다.`);
      setProject((current) => current ? { ...current, jobs: [data.job, ...current.jobs] } : current);
      await loadProject(project.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "씬 생성을 시작하지 못했습니다.");
    } finally {
      setCutBusy(selectedCut.id, null);
    }
  };

  const setApproved = async (cut: ProjectCut, approved: boolean) => {
    setCutBusy(cut.id, approved ? "승인 저장" : "승인 취소");
    try {
      await patchCut(cut.id, { videoApproved: approved });
      setNotice(approved ? "씬을 최종 이어 붙이기 대상으로 승인했습니다." : "씬 승인을 취소했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "씬 승인 상태를 저장하지 못했습니다.");
    } finally {
      setCutBusy(cut.id, null);
    }
  };

  const composeFinalVideo = async () => {
    if (!project || approvedCuts.length === 0 || activeJobCount > 0) return;
    setComposing(true);
    setError(null);
    setNotice(null);
    setComposeProgress(1);
    setOutputBlob(null);
    setOutputUrl(null);
    if (localOutputUrlRef.current) {
      URL.revokeObjectURL(localOutputUrlRef.current);
      localOutputUrlRef.current = null;
    }

    try {
      setComposeStatus("MP4 엔진 준비");
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      activeFfmpegRef.current = ffmpeg;
      ffmpeg.on("log", ({ message }) => {
        if (/error|failed/i.test(message)) console.warn("FFmpeg:", message);
      });
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });

      const dimensions = finalResolution === "1080p"
        ? { width: 1080, height: 1920 }
        : { width: 720, height: 1280 };
      const filter = `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`;
      const normalizedNames: string[] = [];

      for (const [index, cut] of approvedCuts.entries()) {
        setComposeStatus(`씬 ${index + 1}/${approvedCuts.length} 규격 통일`);
        const inputName = `scene_${index}.mp4`;
        const probeName = `probe_${index}.txt`;
        const outputName = `normalized_${index}.mp4`;
        await ffmpeg.writeFile(inputName, await fetchFile(cut.videoUrl!));
        await ffmpeg.ffprobe([
          "-v", "error",
          "-select_streams", "a",
          "-show_entries", "stream=index",
          "-of", "csv=p=0",
          inputName,
          "-o", probeName,
        ]);
        const probe = await ffmpeg.readFile(probeName, "utf8").catch(() => "");
        const hasAudio = String(probe).trim().length > 0;
        const inputs = hasAudio
          ? ["-i", inputName]
          : ["-i", inputName, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
        const code = await ffmpeg.exec([
          ...inputs,
          "-map", "0:v:0",
          "-map", hasAudio ? "0:a:0" : "1:a:0",
          "-vf", filter,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", finalResolution === "1080p" ? "24" : "25",
          "-pix_fmt", "yuv420p",
          "-r", "30",
          "-c:a", "aac",
          "-b:a", "128k",
          "-ar", "48000",
          "-ac", "2",
          "-shortest",
          "-movflags", "+faststart",
          outputName,
        ]);
        if (code !== 0) throw new Error(`${index + 1}번 씬을 MP4 규격으로 변환하지 못했습니다.`);
        normalizedNames.push(outputName);
        setComposeProgress(8 + Math.round(((index + 1) / approvedCuts.length) * 78));
      }

      setComposeStatus("승인 씬 이어 붙이기");
      await ffmpeg.writeFile(
        "concat.txt",
        normalizedNames.map((name) => `file '${name}'`).join("\n")
      );
      const concatCode = await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "concat.txt",
        "-c", "copy",
        "-movflags", "+faststart",
        "short.mp4",
      ]);
      if (concatCode !== 0) throw new Error("최종 MP4를 이어 붙이지 못했습니다.");
      const output = await ffmpeg.readFile("short.mp4");
      if (typeof output === "string") throw new Error("완성 영상 데이터가 올바르지 않습니다.");
      const blob = new Blob([new Uint8Array(output).buffer], { type: "video/mp4" });
      const localUrl = URL.createObjectURL(blob);
      localOutputUrlRef.current = localUrl;
      setOutputBlob(blob);
      setOutputUrl(localUrl);
      setComposeProgress(90);
      setComposeStatus("작업 보관함 저장");

      const ref = await uploadViaTicket({
        signEndpoint: "/api/shorts/upload",
        file: blob,
        filename: `${safeFilePart(project.title)}-${Date.now()}.mp4`,
        contentType: "video/mp4",
        meta: { projectId: project.id, contentType: "video/mp4" },
      });
      await readJson(await fetch("/api/shorts/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref,
          projectId: project.id,
          title: `${project.title} 최종본`,
          cutCount: approvedCuts.length,
        }),
      }));
      setOutputUrl(ref);
      if (localOutputUrlRef.current) {
        URL.revokeObjectURL(localOutputUrlRef.current);
        localOutputUrlRef.current = null;
      }
      setComposeProgress(100);
      setComposeStatus("완료");
      setNotice("승인된 씬을 MP4로 이어 붙여 작업 보관함에 저장했습니다.");
      await loadProject(project.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "최종 MP4를 만들지 못했습니다.");
      setComposeStatus("실패");
    } finally {
      activeFfmpegRef.current?.terminate();
      activeFfmpegRef.current = null;
      setComposing(false);
    }
  };

  const downloadOutput = () => {
    if (!outputBlob || !project) return;
    const url = URL.createObjectURL(outputBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilePart(project.title)}.mp4`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  if (loading) {
    return <main className={styles.loading}><LuLoaderCircle className={styles.spin} /> 숏폼 스튜디오 준비 중</main>;
  }

  if (!project) {
    return (
      <main className={styles.emptyPage}>
        <LuClapperboard />
        <h1>숏폼 프로젝트</h1>
        <button type="button" className={styles.primaryButton} onClick={() => void createProject()}>
          <LuPlus /> 새 프로젝트
        </button>
      </main>
    );
  }

  const currentProvider = providers.find((item) => item.id === asVideoProvider(selectedCut?.videoProvider || "veo"));
  const currentJob = selectedCut ? latestJobByCut.get(selectedCut.id) : undefined;
  const currentInput = jobInput(currentJob);
  const currentDuration = selectedCut ? sceneDurationSeconds(selectedCut, currentProvider) : 4;
  const currentCost = selectedCut
    ? getGenerationCreditCost("video", {
        provider: asVideoProvider(selectedCut.videoProvider),
        durationSeconds: currentDuration,
        resolution: asVideoResolution(selectedCut.videoResolution),
        generateAudio: selectedCut.videoGenerateAudio,
      })
    : 0;
  const currentJobActive = Boolean(currentJob && ["queued", "running"].includes(currentJob.status));

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.iconButton} title="홈" aria-label="홈">
          <LuArrowLeft />
        </Link>
        <Link href="/" className={styles.brand}>
          <LuClapperboard />
          <strong>숏폼 스튜디오</strong>
        </Link>
        <input
          value={project.title}
          maxLength={120}
          aria-label="프로젝트 제목"
          onChange={(event) => setProject({ ...project, title: event.target.value })}
          onBlur={() => void saveProjectTitle()}
        />
        <div className={styles.headerActions}>
          <span className={styles.headerMetric}><LuFilm /> {approvedCuts.length}/{project.cuts.length}</span>
          <GenerationNotifications />
          <Link href={`/studio?projectId=${project.id}`} className={styles.textButton}>
            <LuFolderKanban /> 통합 스튜디오
          </Link>
        </div>
      </header>

      {(error || notice) && (
        <div className={error ? styles.errorBanner : styles.noticeBanner} role="status">
          {error ? <LuCircleAlert /> : <LuCircleCheck />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(null); setNotice(null); }} title="닫기" aria-label="닫기"><LuX /></button>
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.scenePanel}>
          <div className={styles.panelHeader}>
            <select
              value={project.id}
              aria-label="프로젝트 선택"
              onChange={(event) => void loadProject(event.target.value)}
            >
              {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <button type="button" className={styles.iconButton} onClick={() => void createProject()} title="새 프로젝트" aria-label="새 프로젝트"><LuPlus /></button>
          </div>
          <div className={styles.sceneList}>
            {project.cuts.map((cut, index) => {
              const job = latestJobByCut.get(cut.id);
              const active = Boolean(job && ["queued", "running"].includes(job.status));
              return (
                <button
                  type="button"
                  key={cut.id}
                  className={`${styles.sceneItem} ${cut.id === selectedCutId ? styles.sceneItemActive : ""}`}
                  onClick={() => setSelectedCutId(cut.id)}
                >
                  <span className={styles.sceneThumb}>
                    {cut.thumbnailUrl || cut.imageUrl
                      ? <img src={cut.thumbnailUrl || cut.imageUrl!} alt="" />
                      : <LuImagePlus />}
                    <b>{index + 1}</b>
                  </span>
                  <span className={styles.sceneMeta}>
                    <strong>{cut.title || `씬 ${index + 1}`}</strong>
                    <small className={active ? styles.statusActive : cut.videoApprovedAt ? styles.statusApproved : ""}>
                      {active ? `${stageLabel(job)} ${job?.progress || 0}%` : cut.videoApprovedAt ? "승인됨" : cut.videoUrl ? "검토 필요" : stageLabel(job)}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className={styles.addSceneButton} onClick={() => void addScene()} disabled={project.cuts.length >= MAX_SCENES}>
            <LuPlus /> 씬 추가
          </button>
        </aside>

        <main className={styles.editorPanel}>
          {projectLoading || !selectedCut ? (
            <div className={styles.panelLoading}><LuLoaderCircle className={styles.spin} /> 프로젝트 불러오는 중</div>
          ) : (
            <>
              <div className={styles.editorToolbar}>
                <input
                  value={selectedCut.title}
                  maxLength={80}
                  aria-label="씬 제목"
                  onChange={(event) => replaceCut(selectedCut.id, { title: event.target.value })}
                  onBlur={() => void patchCut(selectedCut.id, { title: selectedCut.title })}
                />
                <div>
                  <button type="button" className={styles.iconButton} onClick={() => void moveScene(selectedCut.id, -1)} disabled={selectedCut.order === 0} title="앞으로 이동" aria-label="앞으로 이동"><LuArrowUp /></button>
                  <button type="button" className={styles.iconButton} onClick={() => void moveScene(selectedCut.id, 1)} disabled={selectedCut.order === project.cuts.length - 1} title="뒤로 이동" aria-label="뒤로 이동"><LuArrowDown /></button>
                  <button type="button" className={styles.iconButtonDanger} onClick={() => void removeScene(selectedCut.id)} title="씬 삭제" aria-label="씬 삭제"><LuTrash2 /></button>
                </div>
              </div>

              <section className={styles.sourceSection}>
                <div className={styles.sectionTitle}>
                  <span><LuImagePlus /> 시작 컷</span>
                  <button type="button" className={styles.textButton} onClick={() => openUpload(selectedCut.id)} disabled={Boolean(busy[selectedCut.id])}>
                    {busy[selectedCut.id]?.includes("이미지") ? <LuLoaderCircle className={styles.spin} /> : <LuUpload />} 업로드
                  </button>
                </div>
                <div className={styles.sourceArea}>
                  <button type="button" className={styles.sourcePreview} onClick={() => openUpload(selectedCut.id)} title="시작 이미지 바꾸기">
                    {selectedCut.imageUrl
                      ? <img src={selectedCut.imageUrl} alt={`${selectedCut.title} 시작 컷`} />
                      : <span><LuImagePlus /><b>시작 컷 선택</b></span>}
                  </button>
                  <div className={styles.assetRail}>
                    {imageAssets.map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        className={asset.blobUrl === selectedCut.imageUrl ? styles.assetActive : ""}
                        onClick={() => void selectSourceAsset(asset.id)}
                        title={asset.name}
                      >
                        <img src={asset.thumbnailUrl || asset.blobUrl} alt="" />
                        {asset.blobUrl === selectedCut.imageUrl && <LuCheck />}
                      </button>
                    ))}
                    {imageAssets.length === 0 && <span className={styles.emptyRail}>업로드한 이미지 없음</span>}
                  </div>
                </div>
              </section>

              <section className={styles.promptSection}>
                <div className={styles.sectionTitle}><span><LuSparkles /> 씬 프롬프트</span></div>
                <label>
                  <span>간단 프롬프트</span>
                  <textarea
                    value={selectedCut.prompt}
                    maxLength={2_000}
                    rows={3}
                    placeholder="예: 비 오는 골목에서 주인공이 뒤를 돌아보고 카메라가 빠르게 줌인"
                    onChange={(event) => replaceCut(selectedCut.id, { prompt: event.target.value, videoApprovedAt: null })}
                    onBlur={() => void patchCut(selectedCut.id, { prompt: selectedCut.prompt })}
                  />
                </label>
                <div className={styles.promptActionRow}>
                  <button type="button" className={styles.secondaryButton} onClick={() => void expandPrompt()} disabled={Boolean(busy[selectedCut.id]) || !selectedCut.prompt.trim()}>
                    {busy[selectedCut.id] === "프롬프트 확장" ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />}
                    Gemini Flash로 확장
                    <CreditCostBadge credits={AI_CREDIT_COSTS.videoPrompt} />
                  </button>
                </div>
                <label>
                  <span>제작 프롬프트</span>
                  <textarea
                    value={selectedCut.videoPrompt || ""}
                    maxLength={5_000}
                    rows={7}
                    placeholder="AI 확장 결과를 확인하거나 직접 입력"
                    onChange={(event) => replaceCut(selectedCut.id, { videoPrompt: event.target.value, videoApprovedAt: null })}
                    onBlur={() => void patchCut(selectedCut.id, { videoPrompt: selectedCut.videoPrompt || "" })}
                  />
                </label>
                <label>
                  <span>제외 요소</span>
                  <textarea
                    value={selectedCut.negativePrompt || ""}
                    maxLength={2_000}
                    rows={2}
                    placeholder="왜곡, 자막, 워터마크 등"
                    onChange={(event) => replaceCut(selectedCut.id, { negativePrompt: event.target.value, videoApprovedAt: null })}
                    onBlur={() => void patchCut(selectedCut.id, { negativePrompt: selectedCut.negativePrompt || "" })}
                  />
                </label>
              </section>

              <section className={styles.generationSection}>
                <div className={styles.sectionTitle}><span><LuVideo /> 생성 설정</span></div>
                <div className={styles.providerTabs}>
                  {providers.map((provider) => (
                    <button
                      type="button"
                      key={provider.id}
                      className={asVideoProvider(selectedCut.videoProvider) === provider.id ? styles.providerActive : ""}
                      disabled={!provider.configured || currentJobActive}
                      onClick={() => void changeProvider(provider.id)}
                    >
                      <strong>{provider.label}</strong>
                      <small>{provider.configured
                        ? `${provider.models[asVideoResolution(selectedCut.videoResolution)]} · 4초 ${provider.creditExamples["4s720p"]}C`
                        : "연결 필요"}</small>
                    </button>
                  ))}
                </div>
                <div className={styles.optionGrid}>
                  <label>
                    <span>길이</span>
                    <select
                      value={currentDuration}
                      disabled={currentJobActive}
                      onChange={(event) => {
                        const durationMs = Number(event.target.value) * 1_000;
                        replaceCut(selectedCut.id, { durationMs, videoApprovedAt: null });
                        void patchCut(selectedCut.id, { durationMs });
                      }}
                    >
                      {(currentProvider?.durations || [4, 6, 8]).map((duration) => <option key={duration} value={duration}>{duration}초</option>)}
                    </select>
                  </label>
                  <fieldset>
                    <legend>해상도</legend>
                    <div className={styles.segmented}>
                      {(["720p", "1080p"] as VideoResolution[]).map((resolution) => (
                        <button
                          type="button"
                          key={resolution}
                          className={asVideoResolution(selectedCut.videoResolution) === resolution ? styles.segmentActive : ""}
                          disabled={currentJobActive}
                          onClick={() => {
                            replaceCut(selectedCut.id, { videoResolution: resolution, videoApprovedAt: null });
                            void patchCut(selectedCut.id, { videoResolution: resolution });
                          }}
                        >{resolution}</button>
                      ))}
                    </div>
                  </fieldset>
                  <label className={styles.audioToggle}>
                    <input
                      type="checkbox"
                      checked={selectedCut.videoGenerateAudio}
                      disabled={currentJobActive}
                      onChange={(event) => {
                        const videoGenerateAudio = event.target.checked;
                        replaceCut(selectedCut.id, { videoGenerateAudio, videoApprovedAt: null });
                        void patchCut(selectedCut.id, { videoGenerateAudio });
                      }}
                    />
                    {selectedCut.videoGenerateAudio ? <LuVolume2 /> : <LuVolumeX />}
                    <span>오디오</span>
                  </label>
                </div>
                <button
                  type="button"
                  className={styles.generateButton}
                  onClick={() => void generateScene()}
                  disabled={Boolean(busy[selectedCut.id]) || currentJobActive || !currentProvider?.configured}
                >
                  {currentJobActive || busy[selectedCut.id]?.includes("생성")
                    ? <LuLoaderCircle className={styles.spin} />
                    : selectedCut.videoUrl ? <LuRotateCcw /> : <LuSparkles />}
                  {currentJobActive ? `${stageLabel(currentJob)} ${currentJob?.progress || 0}%` : selectedCut.videoUrl ? "Retry" : "씬 생성"}
                  <CreditCostBadge credits={currentJobActive ? currentJob?.creditUnits || currentCost : currentCost} />
                </button>
                {currentJob?.status === "failed" && <p className={styles.jobError}><LuCircleAlert /> {currentJob.error || "영상 생성에 실패했습니다."}</p>}
                {currentJobActive && <div className={styles.jobProgress}><span style={{ width: `${currentJob?.progress || 0}%` }} /></div>}
                {currentJob && <small className={styles.modelLine}>{currentJob.model} · {String(currentInput.durationSeconds || currentDuration)}s</small>}
              </section>
            </>
          )}
        </main>

        <aside className={styles.reviewPanel}>
          <section className={styles.reviewSection}>
            <div className={styles.sectionTitle}>
              <span><LuVideo /> 씬 검토</span>
              {selectedCut?.videoApprovedAt && <b className={styles.approvedBadge}><LuCheck /> 승인</b>}
            </div>
            <div className={styles.videoFrame}>
              {selectedCut?.videoUrl
                ? <video key={selectedCut.videoUrl} src={selectedCut.videoUrl} controls playsInline />
                : currentJobActive
                  ? <span><LuLoaderCircle className={styles.spin} /><b>{stageLabel(currentJob)}</b><small>{currentJob?.progress || 0}%</small></span>
                  : <span><LuFilm /><b>생성된 씬 없음</b></span>}
            </div>
            {selectedCut?.videoUrl && (
              <div className={styles.reviewActions}>
                <button
                  type="button"
                  className={selectedCut.videoApprovedAt ? styles.secondaryButton : styles.approveButton}
                  onClick={() => void setApproved(selectedCut, !selectedCut.videoApprovedAt)}
                  disabled={Boolean(busy[selectedCut.id]) || currentJobActive}
                >
                  {selectedCut.videoApprovedAt ? <><LuX /> 승인 취소</> : <><LuCheck /> 이 씬 승인</>}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void generateScene()}
                  disabled={Boolean(busy[selectedCut.id]) || currentJobActive || !currentProvider?.configured}
                  title="씬 재생성"
                >
                  <LuRefreshCw /> 재생성
                  <CreditCostBadge credits={currentCost} />
                </button>
              </div>
            )}
          </section>

          <section className={styles.assemblySection}>
            <div className={styles.sectionTitle}>
              <span><LuClapperboard /> 최종 이어 붙이기</span>
              <b>{approvedCuts.length}씬</b>
            </div>
            <div className={styles.approvedList}>
              {project.cuts.map((cut, index) => (
                <div key={cut.id} className={cut.videoApprovedAt ? styles.approvedRow : ""}>
                  <span>{index + 1}</span>
                  <strong>{cut.title}</strong>
                  {cut.videoApprovedAt ? <LuCircleCheck /> : <small>미승인</small>}
                </div>
              ))}
            </div>
            <div className={styles.finalOptions}>
              <span>출력</span>
              <div className={styles.segmented}>
                {(["720p", "1080p"] as VideoResolution[]).map((resolution) => (
                  <button type="button" key={resolution} className={finalResolution === resolution ? styles.segmentActive : ""} onClick={() => setFinalResolution(resolution)} disabled={composing}>{resolution}</button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={styles.composeButton}
              onClick={() => void composeFinalVideo()}
              disabled={composing || approvedCuts.length === 0 || activeJobCount > 0}
            >
              {composing ? <LuLoaderCircle className={styles.spin} /> : <LuClapperboard />}
              {composing ? composeStatus : "최종 MP4 만들기"}
            </button>
            {composing && <div className={styles.composeProgress}><span style={{ width: `${composeProgress}%` }} /><small>{composeProgress}%</small></div>}
          </section>

          <section className={styles.outputSection}>
            <div className={styles.sectionTitle}><span><LuFilm /> 최종 결과</span></div>
            {displayedOutputUrl ? (
              <>
                <video key={displayedOutputUrl} src={displayedOutputUrl} controls playsInline />
                <div className={styles.outputActions}>
                  {outputBlob
                    ? <button type="button" className={styles.secondaryButton} onClick={downloadOutput}><LuDownload /> 다운로드</button>
                    : <a href={displayedOutputUrl} target="_blank" rel="noreferrer" className={styles.secondaryButton}><LuExternalLink /> 열기</a>}
                </div>
              </>
            ) : (
              <div className={styles.emptyOutput}><LuFilm /><span>완성본 없음</span></div>
            )}
          </section>
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void uploadSourceImage(event.target.files?.[0])}
      />
    </div>
  );
}
