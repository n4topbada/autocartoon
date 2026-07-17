"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadViaTicket } from "@/lib/client-upload";
import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowUp,
  LuCheck,
  LuClapperboard,
  LuDownload,
  LuFilm,
  LuFolderKanban,
  LuImage,
  LuLoaderCircle,
  LuPlus,
  LuSave,
  LuSparkles,
  LuTrash2,
  LuUpload,
  LuVolume2,
  LuX,
} from "react-icons/lu";
import { CHARACTER_VOICES } from "@/lib/character-voices";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import CreditCostBadge from "./CreditCostBadge";
import GenerationNotifications from "./GenerationNotifications";
import styles from "./ShortVideoBuilder.module.css";

type SourceMode = "project" | "upload";
type Resolution = "720p" | "1080p";

interface ProjectSummary {
  id: string;
  title: string;
  usableCutCount: number;
  coverCut: { imageUrl: string | null; thumbnailUrl: string | null } | null;
  cuts: Array<{ imageUrl: string | null; thumbnailUrl: string | null }>;
}

interface ProjectCut {
  id: string;
  order: number;
  title: string;
  durationMs: number;
  dialogue: string | null;
  dialoguePlan: unknown;
  speakerPresetId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

interface StudioProject {
  id: string;
  title: string;
  cuts: ProjectCut[];
}

interface CharacterPreset {
  id: string;
  name: string;
  voiceConfig?: Array<{ label: string; voiceId: string }> | null;
}

interface ShortDialogue {
  id: string;
  text: string;
  speakerPresetId: string | null;
}

interface ShortCut {
  id: string;
  sourceCutId: string | null;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  dialogues: ShortDialogue[];
}

interface ActiveFFmpeg {
  terminate: () => void;
}

const NARRATOR_ID = "narrator";
const MAX_CUTS = 30;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body as T;
}

function normalizeDialogues(cut: ProjectCut): ShortDialogue[] {
  if (Array.isArray(cut.dialoguePlan)) {
    const parsed = cut.dialoguePlan.flatMap((item, index): ShortDialogue[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) return [];
      return [{
        id: typeof record.id === "string" ? record.id : `${cut.id}_${index}`,
        text,
        speakerPresetId: typeof record.speakerPresetId === "string" ? record.speakerPresetId : null,
      }];
    });
    if (parsed.length > 0) return parsed;
  }
  return cut.dialogue?.trim()
    ? [{ id: `${cut.id}_dialogue`, text: cut.dialogue.trim(), speakerPresetId: cut.speakerPresetId }]
    : [];
}

function splitForTts(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1);
    const boundary = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" ")
    );
    const end = boundary > maxLength * 0.5 ? boundary + 1 : maxLength;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "short";
}

export default function ShortVideoBuilder() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("project");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [characters, setCharacters] = useState<CharacterPreset[]>([]);
  const [cuts, setCuts] = useState<ShortCut[]>([]);
  const [title, setTitle] = useState("새 숏폼 영상");
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, string>>({
    [NARRATOR_ID]: CHARACTER_VOICES[0].voiceId,
  });
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [saveOnline, setSaveOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingDialogues, setSavingDialogues] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFfmpegRef = useRef<ActiveFFmpeg | null>(null);
  const cancelRequestedRef = useRef(false);
  const localInputUrlsRef = useRef(new Set<string>());
  const localOutputUrlRef = useRef<string | null>(null);

  const loadProject = useCallback(async (projectId: string) => {
    setProjectLoading(true);
    setError(null);
    try {
      const data = await readJson<{ project: StudioProject }>(
        await fetch(`/api/studio/projects/${projectId}`, { cache: "no-store" })
      );
      setTitle(`${data.project.title} 숏폼`);
      setCuts(data.project.cuts
        .filter((cut) => Boolean(cut.imageUrl))
        .slice(0, MAX_CUTS)
        .map((cut) => ({
          id: cut.id,
          sourceCutId: cut.id,
          title: cut.title,
          imageUrl: cut.imageUrl!,
          thumbnailUrl: cut.thumbnailUrl || cut.imageUrl!,
          durationSeconds: Math.max(2, Math.min(30, Math.round(cut.durationMs / 1000) || 5)),
          dialogues: normalizeDialogues(cut),
        }))
      );
      setSavedProjectId(data.project.id);
    } catch (cause) {
      setCuts([]);
      setError(cause instanceof Error ? cause.message : "프로젝트를 불러오지 못했습니다.");
    } finally {
      setProjectLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [projectData, characterData] = await Promise.all([
        readJson<{ projects: ProjectSummary[] }>(await fetch("/api/studio/projects", { cache: "no-store" })),
        readJson<{ groups: Array<{ presets: CharacterPreset[] }>; ungrouped: CharacterPreset[] }>(
          await fetch("/api/presets", { cache: "no-store" })
        ),
      ]);
      if (!active) return;
      setProjects(projectData.projects);
      setCharacters(Array.from(new Map<string, CharacterPreset>(
        [...characterData.ungrouped, ...characterData.groups.flatMap((group) => group.presets)]
          .map((character) => [character.id, character])
      ).values()));
      const firstProject = projectData.projects.find((item) => item.usableCutCount > 0);
      if (firstProject) {
        setSelectedProjectId(firstProject.id);
        void loadProject(firstProject.id);
      }
    })().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "숏폼 제작 화면을 준비하지 못했습니다.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadProject]);

  useEffect(() => () => {
    localInputUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    if (localOutputUrlRef.current) URL.revokeObjectURL(localOutputUrlRef.current);
    activeFfmpegRef.current?.terminate();
  }, []);

  const speakerIds = useMemo(() => Array.from(new Set(
    cuts.flatMap((cut) => cut.dialogues.map((dialogue) => dialogue.speakerPresetId || NARRATOR_ID))
  )), [cuts]);

  const ttsCreditCost = useMemo(() => {
    const requests = new Set<string>();
    for (const cut of cuts) {
      for (const dialogue of cut.dialogues) {
        const speakerId = dialogue.speakerPresetId || NARRATOR_ID;
        const voiceId = voiceAssignments[speakerId] || CHARACTER_VOICES[0].voiceId;
        for (const text of splitForTts(dialogue.text)) requests.add(`${voiceId}:${text}`);
      }
    }
    return requests.size * AI_CREDIT_COSTS.tts;
  }, [cuts, voiceAssignments]);

  useEffect(() => {
    setVoiceAssignments((current) => {
      const next = { ...current };
      for (const speakerId of speakerIds) {
        if (next[speakerId]) continue;
        const character = characters.find((item) => item.id === speakerId);
        next[speakerId] = character?.voiceConfig?.[0]?.voiceId || CHARACTER_VOICES[0].voiceId;
      }
      return next;
    });
  }, [characters, speakerIds]);

  const switchSource = (mode: SourceMode) => {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setError(null);
    setOutputUrl(null);
    setOutputBlob(null);
    setSavedProjectId(mode === "project" ? selectedProjectId || null : null);
    if (mode === "project" && selectedProjectId) void loadProject(selectedProjectId);
    if (mode === "upload") {
      setCuts([]);
      setTitle("업로드 이미지 숏폼");
    }
  };

  const addUploadFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES);
    if (imageFiles.length !== files.length) {
      setError("20MB 이하 이미지 파일만 사용할 수 있습니다.");
    }
    setCuts((current) => {
      const remaining = Math.max(0, MAX_CUTS - current.length);
      return [...current, ...imageFiles.slice(0, remaining).map((file, index) => {
        const url = URL.createObjectURL(file);
        localInputUrlsRef.current.add(url);
        return {
          id: `upload_${crypto.randomUUID()}`,
          sourceCutId: null,
          title: file.name.replace(/\.[^.]+$/, "") || `컷 ${current.length + index + 1}`,
          imageUrl: url,
          thumbnailUrl: url,
          durationSeconds: 5,
          dialogues: [],
        } satisfies ShortCut;
      })];
    });
  };

  const removeCut = (cutId: string) => {
    setCuts((current) => {
      const target = current.find((cut) => cut.id === cutId);
      if (target?.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.imageUrl);
        localInputUrlsRef.current.delete(target.imageUrl);
      }
      return current.filter((cut) => cut.id !== cutId);
    });
  };

  const moveCut = (index: number, direction: -1 | 1) => {
    setCuts((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateCut = (cutId: string, updates: Partial<ShortCut>) => {
    setCuts((current) => current.map((cut) => cut.id === cutId ? { ...cut, ...updates } : cut));
  };

  const addDialogue = (cutId: string) => {
    setCuts((current) => current.map((cut) => cut.id === cutId && cut.dialogues.length < 12
      ? {
          ...cut,
          dialogues: [...cut.dialogues, {
            id: `dialogue_${crypto.randomUUID()}`,
            text: "",
            speakerPresetId: null,
          }],
        }
      : cut
    ));
  };

  const updateDialogue = (cutId: string, dialogueId: string, updates: Partial<ShortDialogue>) => {
    setCuts((current) => current.map((cut) => cut.id === cutId
      ? {
          ...cut,
          dialogues: cut.dialogues.map((dialogue) => dialogue.id === dialogueId ? { ...dialogue, ...updates } : dialogue),
        }
      : cut
    ));
  };

  const removeDialogue = (cutId: string, dialogueId: string) => {
    setCuts((current) => current.map((cut) => cut.id === cutId
      ? { ...cut, dialogues: cut.dialogues.filter((dialogue) => dialogue.id !== dialogueId) }
      : cut
    ));
  };

  const analyzeProject = async () => {
    if (!selectedProjectId) return;
    setAnalyzing(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/studio/projects/${selectedProjectId}/video-plan`, { method: "POST" }));
      await loadProject(selectedProjectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "대사를 분석하지 못했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDialogues = async () => {
    const projectCuts = cuts.filter((cut) => cut.sourceCutId);
    if (projectCuts.length === 0) return;
    setSavingDialogues(true);
    setError(null);
    try {
      await Promise.all(projectCuts.map(async (cut) => {
        const dialogues = cut.dialogues.filter((dialogue) => dialogue.text.trim());
        return readJson(await fetch(`/api/studio/cuts/${cut.sourceCutId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dialoguePlan: dialogues,
            dialogue: dialogues.map((dialogue) => dialogue.text.trim()).join("\n"),
            speakerPresetId: dialogues[0]?.speakerPresetId || "",
            durationMs: Math.round(cut.durationSeconds * 1000),
          }),
        }));
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "대사를 저장하지 못했습니다.");
    } finally {
      setSavingDialogues(false);
    }
  };

  const previewVoice = async (speakerId: string) => {
    const character = characters.find((item) => item.id === speakerId);
    const voiceId = voiceAssignments[speakerId] || CHARACTER_VOICES[0].voiceId;
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId,
          text: character ? `${character.name}의 목소리입니다.` : "숏폼 내레이션 목소리입니다.",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "음성을 만들지 못했습니다.");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "음성을 미리듣지 못했습니다.");
    }
  };

  const createShortVideo = async () => {
    if (cuts.length === 0) {
      setError("영상으로 만들 컷 이미지를 선택해주세요.");
      return;
    }
    cancelRequestedRef.current = false;
    setGenerating(true);
    setError(null);
    setOutputUrl(null);
    setOutputBlob(null);
    setProgress(1);
    if (localOutputUrlRef.current) {
      URL.revokeObjectURL(localOutputUrlRef.current);
      localOutputUrlRef.current = null;
    }

    let audioContext: AudioContext | null = null;
    try {
      setStatus("영상 엔진을 불러오고 있습니다.");
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
      setProgress(8);

      audioContext = new AudioContext();
      const ttsCache = new Map<string, { bytes: Uint8Array; duration: number }>();
      const clipNames: string[] = [];
      const { width, height } = resolution === "1080p"
        ? { width: 1080, height: 1920 }
        : { width: 720, height: 1280 };
      const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

      for (const [cutIndex, cut] of cuts.entries()) {
        if (cancelRequestedRef.current) throw new Error("CANCELED");
        setStatus(`${cutIndex + 1}/${cuts.length}컷 이미지와 음성을 준비하고 있습니다.`);
        const imageName = `image_${cutIndex}.png`;
        await ffmpeg.writeFile(imageName, await fetchFile(cut.imageUrl));

        const dialogueAudioNames: string[] = [];
        let dialogueDuration = 0;
        let audioIndex = 0;
        for (const dialogue of cut.dialogues.filter((item) => item.text.trim())) {
          const speakerId = dialogue.speakerPresetId || NARRATOR_ID;
          const voiceId = voiceAssignments[speakerId] || CHARACTER_VOICES[0].voiceId;
          for (const text of splitForTts(dialogue.text)) {
            const cacheKey = `${voiceId}:${text}`;
            let audio = ttsCache.get(cacheKey);
            if (!audio) {
              const response = await fetch("/api/tts/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceId, text }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || "대사 음성을 만들지 못했습니다.");
              }
              const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());
              const decoded = await audioContext.decodeAudioData(bytes.buffer.slice(0));
              audio = { bytes, duration: decoded.duration };
              ttsCache.set(cacheKey, audio);
            }
            const name = `audio_${cutIndex}_${audioIndex++}.mp3`;
            await ffmpeg.writeFile(name, audio.bytes);
            dialogueAudioNames.push(name);
            dialogueDuration += audio.duration;
          }
        }

        let audioName: string | null = null;
        if (dialogueAudioNames.length === 1) {
          audioName = dialogueAudioNames[0];
        } else if (dialogueAudioNames.length > 1) {
          audioName = `audio_${cutIndex}_merged.m4a`;
          const code = await ffmpeg.exec([
            ...dialogueAudioNames.flatMap((name) => ["-i", name]),
            "-filter_complex",
            `${dialogueAudioNames.map((_, index) => `[${index}:a]`).join("")}concat=n=${dialogueAudioNames.length}:v=0:a=1[a]`,
            "-map", "[a]",
            "-c:a", "aac",
            "-b:a", "128k",
            audioName,
          ]);
          if (code !== 0) throw new Error(`${cutIndex + 1}컷 음성을 합치지 못했습니다.`);
        }

        const duration = Math.max(2, Math.min(30, Math.max(cut.durationSeconds, dialogueDuration + 0.45)));
        const clipName = `clip_${cutIndex}.mp4`;
        const inputs = audioName
          ? ["-loop", "1", "-i", imageName, "-i", audioName]
          : ["-loop", "1", "-i", imageName, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
        const code = await ffmpeg.exec([
          ...inputs,
          "-vf", videoFilter,
          "-r", "30",
          "-t", duration.toFixed(3),
          "-af", "apad",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", resolution === "1080p" ? "25" : "26",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          clipName,
        ]);
        if (code !== 0) throw new Error(`${cutIndex + 1}컷 영상을 만들지 못했습니다.`);
        clipNames.push(clipName);
        setProgress(10 + Math.round(((cutIndex + 1) / cuts.length) * 72));
      }
      setStatus("컷을 하나의 MP4로 합치고 있습니다.");
      await ffmpeg.writeFile("concat.txt", clipNames.map((name) => `file '${name}'`).join("\n"));
      const concatCode = await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "concat.txt",
        "-c", "copy",
        "-movflags", "+faststart",
        "short.mp4",
      ]);
      if (concatCode !== 0) throw new Error("최종 영상을 합치지 못했습니다.");
      const output = await ffmpeg.readFile("short.mp4");
      if (typeof output === "string") throw new Error("완성 영상 데이터가 올바르지 않습니다.");
      const blob = new Blob([new Uint8Array(output).buffer], { type: "video/mp4" });
      const localUrl = URL.createObjectURL(blob);
      if (localOutputUrlRef.current) URL.revokeObjectURL(localOutputUrlRef.current);
      localOutputUrlRef.current = localUrl;
      setOutputBlob(blob);
      setOutputUrl(localUrl);
      setProgress(88);

      if (!saveOnline) {
        setSavedProjectId(sourceMode === "project" ? selectedProjectId || null : null);
        setStatus("숏폼 영상이 완성됐습니다. 이 브라우저에서 바로 다운로드할 수 있습니다.");
        setProgress(100);
        return;
      }

      let targetProjectId = sourceMode === "project" ? selectedProjectId : "";
      if (!targetProjectId) {
        setStatus("완성 영상을 보관할 프로젝트를 만들고 있습니다.");
        const data = await readJson<{ project: { id: string } }>(await fetch("/api/studio/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() || "업로드 이미지 숏폼", aspectRatio: "9:16" }),
        }));
        targetProjectId = data.project.id;
      }
      setSavedProjectId(targetProjectId);

      setStatus("완성 영상을 작업 보관함에 저장하고 있습니다.");
      setProgress(93);
      try {
        const ref = await uploadViaTicket({
          signEndpoint: "/api/shorts/upload",
          file: blob,
          filename: `${safeFilePart(title)}-${Date.now()}.mp4`,
          contentType: "video/mp4",
          meta: { projectId: targetProjectId, contentType: "video/mp4" },
        });
        await readJson(await fetch("/api/shorts/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref,
            projectId: targetProjectId,
            title: title.trim() || "숏폼 영상",
            cutCount: cuts.length,
          }),
        }));
        setOutputUrl(ref);
        if (localOutputUrlRef.current) {
          URL.revokeObjectURL(localOutputUrlRef.current);
          localOutputUrlRef.current = null;
        }
        setStatus("숏폼 영상이 완성되어 작업 보관함에 저장됐습니다.");
        setProgress(100);
      } catch (uploadError) {
        setStatus("영상은 완성됐지만 온라인 보관에 실패했습니다. 지금 다운로드할 수 있습니다.");
        setError(uploadError instanceof Error ? uploadError.message : "완성 영상을 보관하지 못했습니다.");
        setProgress(100);
      }
    } catch (cause) {
      if (cancelRequestedRef.current || (cause instanceof Error && cause.message === "CANCELED")) {
        setStatus("영상 만들기를 취소했습니다.");
        setProgress(0);
      } else {
        setError(cause instanceof Error ? cause.message : "숏폼 영상을 만들지 못했습니다.");
        setStatus("영상 만들기에 실패했습니다.");
      }
    } finally {
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close().catch(() => undefined);
      }
      activeFfmpegRef.current?.terminate();
      activeFfmpegRef.current = null;
      setGenerating(false);
    }
  };

  const cancelGeneration = () => {
    cancelRequestedRef.current = true;
    setStatus("영상 만들기를 취소하고 있습니다.");
    activeFfmpegRef.current?.terminate();
  };

  const downloadOutput = () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilePart(title)}.mp4`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  if (loading) {
    return <main className={styles.loading}><LuLoaderCircle className={styles.spin} /> 숏폼 제작 화면을 준비하고 있습니다.</main>;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.iconButton} title="홈으로"><LuArrowLeft /></Link>
        <div className={styles.brand}><LuFilm /><strong>숏폼 제작</strong></div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} aria-label="숏폼 제목" />
        <div className={styles.headerActions}>
          <Link href="/studio" className={styles.studioLink}><LuClapperboard /> 스튜디오</Link>
          <GenerationNotifications />
        </div>
      </header>

      {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => setError(null)} title="닫기"><LuX /></button></div>}

      <div className={styles.workspace}>
        <aside className={styles.sourcePanel}>
          <div className={styles.sourceTabs} aria-label="이미지 소스">
            <button className={sourceMode === "project" ? styles.activeTab : ""} onClick={() => switchSource("project")}>
              <LuFolderKanban /> 내 프로젝트
            </button>
            <button className={sourceMode === "upload" ? styles.activeTab : ""} onClick={() => switchSource("upload")}>
              <LuUpload /> 이미지 업로드
            </button>
          </div>

          {sourceMode === "project" ? (
            <div className={styles.projectList}>
              {projects.map((item) => {
                const image = item.coverCut?.thumbnailUrl || item.coverCut?.imageUrl || item.cuts[0]?.thumbnailUrl || item.cuts[0]?.imageUrl;
                return (
                  <button
                    key={item.id}
                    className={selectedProjectId === item.id ? styles.projectActive : ""}
                    onClick={() => { setSelectedProjectId(item.id); void loadProject(item.id); }}
                    disabled={item.usableCutCount === 0}
                  >
                    <span>{image ? <img src={image} alt="" /> : <LuImage />}</span>
                    <div><strong>{item.title}</strong><small>{item.usableCutCount}개 컷 사용 가능</small></div>
                  </button>
                );
              })}
              {projects.length === 0 && <div className={styles.emptySource}>먼저 스튜디오에서 프로젝트를 만들어주세요.</div>}
            </div>
          ) : (
            <div
              className={styles.dropZone}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); addUploadFiles(Array.from(event.dataTransfer.files)); }}
            >
              <LuUpload />
              <strong>컷 이미지를 놓으세요</strong>
              <span>PNG, JPG, WEBP · 최대 {MAX_CUTS}장</span>
              <button onClick={() => fileInputRef.current?.click()}>이미지 선택</button>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  addUploadFiles(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
              />
            </div>
          )}
        </aside>

        <main className={styles.editor}>
          <div className={styles.editorHeader}>
            <div><strong>컷과 대사</strong><span>{cuts.length}/{MAX_CUTS}컷</span></div>
            {sourceMode === "project" && selectedProjectId && (
              <div>
                <button onClick={() => void analyzeProject()} disabled={analyzing || projectLoading}>
                  {analyzing ? <LuLoaderCircle className={styles.spin} /> : <LuSparkles />} AI 대사 분석
                  <CreditCostBadge credits={AI_CREDIT_COSTS.videoPlan} />
                </button>
                <button onClick={() => void saveDialogues()} disabled={savingDialogues || cuts.length === 0}>
                  {savingDialogues ? <LuLoaderCircle className={styles.spin} /> : <LuSave />} 대사 저장
                </button>
              </div>
            )}
          </div>

          {projectLoading ? (
            <div className={styles.emptyEditor}><LuLoaderCircle className={styles.spin} /> 프로젝트를 불러오는 중</div>
          ) : cuts.length === 0 ? (
            <div className={styles.emptyEditor}><LuImage /><strong>영상으로 만들 이미지가 없습니다.</strong><span>이미지가 있는 프로젝트를 고르거나 직접 업로드해주세요.</span></div>
          ) : (
            <div className={styles.cutList}>
              {cuts.map((cut, index) => (
                <article className={styles.cutRow} key={cut.id}>
                  <div className={styles.orderControls}>
                    <span>{index + 1}</span>
                    <button onClick={() => moveCut(index, -1)} disabled={index === 0} title="앞으로"><LuArrowUp /></button>
                    <button onClick={() => moveCut(index, 1)} disabled={index === cuts.length - 1} title="뒤로"><LuArrowDown /></button>
                  </div>
                  <img src={cut.thumbnailUrl} alt="" />
                  <div className={styles.cutContent}>
                    <div className={styles.cutTopline}>
                      <input value={cut.title} onChange={(event) => updateCut(cut.id, { title: event.target.value })} aria-label={`${index + 1}컷 제목`} />
                      <label><span>최소</span><input type="number" min={2} max={30} value={cut.durationSeconds} onChange={(event) => updateCut(cut.id, { durationSeconds: Math.max(2, Math.min(30, Number(event.target.value) || 2)) })} /><span>초</span></label>
                      <button onClick={() => removeCut(cut.id)} title="영상에서 제외"><LuTrash2 /></button>
                    </div>
                    <div className={styles.dialogues}>
                      {cut.dialogues.map((dialogue) => (
                        <div className={styles.dialogueRow} key={dialogue.id}>
                          <select value={dialogue.speakerPresetId || NARRATOR_ID} onChange={(event) => updateDialogue(cut.id, dialogue.id, { speakerPresetId: event.target.value === NARRATOR_ID ? null : event.target.value })} aria-label="화자">
                            <option value={NARRATOR_ID}>내레이터</option>
                            {characters.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}
                          </select>
                          <textarea value={dialogue.text} onChange={(event) => updateDialogue(cut.id, dialogue.id, { text: event.target.value })} maxLength={1_000} rows={2} aria-label="대사" placeholder="이 컷에서 읽을 대사" />
                          <button onClick={() => removeDialogue(cut.id, dialogue.id)} title="대사 삭제"><LuX /></button>
                        </div>
                      ))}
                      <button className={styles.addDialogue} onClick={() => addDialogue(cut.id)} disabled={cut.dialogues.length >= 12}><LuPlus /> 대사 추가</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>

        <aside className={styles.outputPanel}>
          <section>
            <h2>인물별 목소리</h2>
            <div className={styles.voiceList}>
              {(speakerIds.length > 0 ? speakerIds : [NARRATOR_ID]).map((speakerId) => {
                const character = characters.find((item) => item.id === speakerId);
                return (
                  <label key={speakerId}>
                    <span>{character?.name || "내레이터"}</span>
                    <div>
                      <select value={voiceAssignments[speakerId] || CHARACTER_VOICES[0].voiceId} onChange={(event) => setVoiceAssignments((current) => ({ ...current, [speakerId]: event.target.value }))}>
                        {CHARACTER_VOICES.map((voice) => <option value={voice.voiceId} key={voice.voiceId}>{voice.label} · {voice.description}</option>)}
                      </select>
                      <button onClick={() => void previewVoice(speakerId)} title="목소리 미리듣기">
                        <LuVolume2 />
                        <CreditCostBadge credits={AI_CREDIT_COSTS.tts} />
                      </button>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h2>출력 설정</h2>
            <div className={styles.resolutionControl} aria-label="영상 해상도">
              <button className={resolution === "720p" ? styles.resolutionActive : ""} onClick={() => setResolution("720p")} aria-pressed={resolution === "720p"}>720p 빠름</button>
              <button className={resolution === "1080p" ? styles.resolutionActive : ""} onClick={() => setResolution("1080p")} aria-pressed={resolution === "1080p"}>1080p 고화질</button>
            </div>
            <label className={styles.storageToggle}>
              <input type="checkbox" checked={saveOnline} onChange={(event) => setSaveOnline(event.target.checked)} />
              <span>작업 보관함에 온라인 저장</span>
            </label>
            <p>영상 합성은 브라우저에서 처리됩니다. 대사는 음성 생성 사용량을, 온라인 저장은 Blob 저장 공간을 사용합니다.</p>
          </section>

          {outputUrl && (
            <section className={styles.result}>
              <h2><LuCheck /> 완성 영상</h2>
              <video src={outputUrl} controls playsInline preload="metadata" />
              <div>
                <button onClick={downloadOutput} disabled={!outputBlob}><LuDownload /> MP4 다운로드</button>
                {savedProjectId && <Link href={`/studio?project=${encodeURIComponent(savedProjectId)}`}><LuFolderKanban /> 프로젝트에서 보기</Link>}
              </div>
            </section>
          )}

          <div className={styles.generateArea}>
            {status && <span>{status}</span>}
            {generating && <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>}
            {generating ? (
              <button className={styles.cancelButton} onClick={cancelGeneration}><LuX /> 취소</button>
            ) : (
              <button className={styles.generateButton} onClick={() => void createShortVideo()} disabled={cuts.length === 0}>
                <LuFilm /> 숏폼 MP4 만들기
                {ttsCreditCost > 0 && <CreditCostBadge credits={ttsCreditCost} />}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
