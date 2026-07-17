"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuCheck,
  LuCirclePlay,
  LuLoaderCircle,
  LuSave,
  LuSearch,
  LuStar,
  LuTrash2,
  LuUpload,
  LuX,
} from "react-icons/lu";
import { resizeFromFile } from "@/lib/image-resize";
import {
  CHARACTER_VOICES,
  searchCharacterVoices,
  type CharacterVoice,
} from "@/lib/character-voices";
import CreditCostBadge from "@/components/CreditCostBadge";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import styles from "./CharacterManagementModal.module.css";

interface PresetImageData {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string;
  view?: string;
}

interface ManagedPreset {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  voiceConfig?: Array<{ label: string; voiceId: string }> | null;
  representativeImage: PresetImageData | null;
  images: PresetImageData[];
}

interface Props {
  preset: ManagedPreset;
  onClose: () => void;
  onUpdate: (updated: ManagedPreset) => void;
  onDelete?: (presetId: string) => void;
}

const VIEWS = [
  { id: "front", label: "정면" },
  { id: "left", label: "좌측" },
  { id: "right", label: "우측" },
  { id: "back", label: "후면" },
] as const;

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function CharacterManagementModal({ preset, onClose, onUpdate, onDelete }: Props) {
  const [images, setImages] = useState<PresetImageData[]>(preset.images);
  const [repId, setRepId] = useState<string | null>(preset.representativeImage?.id ?? preset.images[0]?.id ?? null);
  const [description, setDescription] = useState(preset.description ?? "");
  const [isDefault, setIsDefault] = useState(Boolean(preset.isDefault));
  const [voiceQuery, setVoiceQuery] = useState("");
  const [previewText, setPreviewText] = useState("안녕! 오늘은 어떤 이야기를 함께 만들어볼까?");
  const [selectedVoices, setSelectedVoices] = useState<Array<{ label: string; voiceId: string }>>(
    preset.voiceConfig ?? []
  );
  const [pendingView, setPendingView] = useState<string>("front");
  const [uploadingView, setUploadingView] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingPreset, setDeletingPreset] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setImages(preset.images);
    setRepId(preset.representativeImage?.id ?? preset.images[0]?.id ?? null);
    setDescription(preset.description ?? "");
    setIsDefault(Boolean(preset.isDefault));
    setSelectedVoices(preset.voiceConfig ?? []);
  }, [preset]);

  const MAX_VOICES = 3;
  const isVoiceSelected = (voiceId: string) => selectedVoices.some((v) => v.voiceId === voiceId);
  const toggleVoice = (voice: CharacterVoice) => {
    setSelectedVoices((current) => {
      if (current.some((v) => v.voiceId === voice.voiceId)) {
        return current.filter((v) => v.voiceId !== voice.voiceId);
      }
      if (current.length >= MAX_VOICES) return current;
      return [...current, { label: voice.label, voiceId: voice.voiceId }];
    });
  };
  const makeDefaultVoice = (voiceId: string) => {
    setSelectedVoices((current) => {
      const target = current.find((v) => v.voiceId === voiceId);
      if (!target) return current;
      return [target, ...current.filter((v) => v.voiceId !== voiceId)];
    });
  };
  const removeVoice = (voiceId: string) => {
    setSelectedVoices((current) => current.filter((v) => v.voiceId !== voiceId));
  };

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  // 방향이 정해지지 않은(reference) 이미지들. 자동으로 좌/우/후면 등에 억지로
  // 배정하지 않고 아래 '미분류' 영역에 노출해 사용자가 직접 지정하게 한다.
  // (예전에는 모달을 열기만 해도 정면 변형들을 좌/우/후면으로 잘못 재라벨했다)
  const unclassifiedImages = useMemo(
    () => images.filter((image) => !VIEWS.some((view) => view.id === image.view)),
    [images]
  );

  const visibleVoices = useMemo(
    () => voiceQuery.trim() ? searchCharacterVoices(voiceQuery).slice(0, 8) : CHARACTER_VOICES.slice(0, 8),
    [voiceQuery]
  );

  const updateParent = useCallback((next: Partial<ManagedPreset>) => {
    onUpdate({
      ...preset,
      images,
      representativeImage: images.find((image) => image.id === repId) ?? images[0] ?? null,
      description,
      isDefault,
      // 저장하지 않은 음성 선택이 다른 이미지 작업으로 초기화되지 않도록 라이브 상태를 넘긴다.
      voiceConfig: selectedVoices,
      ...next,
    });
  }, [description, images, isDefault, onUpdate, preset, repId, selectedVoices]);

  const setRepresentative = async (imageId: string) => {
    const previous = repId;
    setRepId(imageId);
    try {
      await readJson(await fetch(`/api/presets/${preset.id}/representative`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      }));
      updateParent({ representativeImage: images.find((image) => image.id === imageId) ?? null });
      setStatus({ kind: "success", text: "대표 이미지를 변경했습니다." });
    } catch (cause) {
      setRepId(previous);
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "대표 이미지를 변경하지 못했습니다." });
    }
  };

  const requestUpload = (view: string) => {
    setPendingView(view);
    fileRef.current?.click();
  };

  const uploadImage = async (file: File, view: string) => {
    setUploadingView(view);
    setStatus(null);
    try {
      const image = await resizeFromFile(file);
      const data = await readJson<{ images: PresetImageData[] }>(await fetch(`/api/presets/${preset.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [{ ...image, view }] }),
      }));
      const nextImages = [...images, ...data.images];
      setImages(nextImages);
      updateParent({ images: nextImages });
      setStatus({ kind: "success", text: `${VIEWS.find((item) => item.id === view)?.label} 이미지를 추가했습니다.` });
    } catch (cause) {
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "이미지를 추가하지 못했습니다." });
    } finally {
      setUploadingView(null);
    }
  };

  const changeView = async (imageId: string, view: string) => {
    const current = images.find((image) => image.id === imageId);
    if (!current || current.view === view) return;
    const occupied = images.find((image) => image.id !== imageId && image.view === view);
    const previous = images;
    const next = images.map((image) => {
      if (image.id === imageId) return { ...image, view };
      if (occupied && image.id === occupied.id) return { ...image, view: current.view || "reference" };
      return image;
    });
    setImages(next);
    try {
      await Promise.all([
        fetch(`/api/presets/${preset.id}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId, view }),
        }).then(readJson),
        ...(occupied ? [fetch(`/api/presets/${preset.id}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: occupied.id, view: current.view || "reference" }),
        }).then(readJson)] : []),
      ]);
      updateParent({ images: next });
    } catch (cause) {
      setImages(previous);
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "이미지 방향을 바꾸지 못했습니다." });
    }
  };

  const deleteImage = async (imageId: string) => {
    if (images.length <= 1) return;
    try {
      await readJson(await fetch(`/api/presets/${preset.id}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      }));
      const nextImages = images.filter((image) => image.id !== imageId);
      const nextRepId = repId === imageId ? nextImages[0]?.id ?? null : repId;
      setImages(nextImages);
      setRepId(nextRepId);
      if (nextRepId && repId === imageId) await setRepresentative(nextRepId);
      updateParent({
        images: nextImages,
        representativeImage: nextImages.find((image) => image.id === nextRepId) ?? null,
      });
    } catch (cause) {
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "이미지를 삭제하지 못했습니다." });
    }
  };

  const previewVoice = async (voice: CharacterVoice) => {
    if (!previewText.trim()) return;
    setPreviewingVoice(voice.voiceId);
    setStatus(null);
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.voiceId, text: previewText.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "음성 미리듣기를 생성하지 못했습니다.");
      }
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const audioUrl = URL.createObjectURL(await response.blob());
      audioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      await audio.play();
    } catch (cause) {
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "음성을 재생하지 못했습니다." });
      setPreviewingVoice(null);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setStatus(null);
    try {
      await readJson(await fetch(`/api/presets/${preset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          isDefault,
          voiceConfig: selectedVoices,
        }),
      }));
      updateParent({ description, isDefault, voiceConfig: selectedVoices });
      setStatus({ kind: "success", text: "캐릭터 설정을 저장했습니다." });
    } catch (cause) {
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "설정을 저장하지 못했습니다." });
    } finally {
      setSavingSettings(false);
    }
  };

  const deletePreset = async () => {
    if (!window.confirm(`'${preset.name}' 캐릭터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingPreset(true);
    setStatus(null);
    try {
      await readJson(await fetch(`/api/presets/${preset.id}`, { method: "DELETE" }));
      onDelete?.(preset.id);
      onClose();
    } catch (cause) {
      setStatus({ kind: "error", text: cause instanceof Error ? cause.message : "캐릭터를 삭제하지 못했습니다." });
      setDeletingPreset(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <h2>{preset.name}</h2>
            <span>캐릭터 설정</span>
          </div>
          <button className={styles.iconButton} onClick={onClose} title="닫기"><LuX /></button>
        </header>

        {status && (
          <div className={status.kind === "error" ? styles.error : styles.success} role="status">
            {status.kind === "error" ? <LuX /> : <LuCheck />}
            <span>{status.text}</span>
          </div>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>4면 이미지</h3>
            <button
              className={isDefault ? styles.defaultActive : styles.defaultButton}
              aria-pressed={isDefault}
              onClick={() => setIsDefault((current) => !current)}
            >
              <LuStar /> 기본 캐릭터
            </button>
          </div>
          <div className={styles.viewGrid}>
            {VIEWS.map((view) => {
              const image = images.find((item) => item.view === view.id);
              return (
                <article className={styles.viewSlot} key={view.id}>
                  <div className={styles.viewLabel}>{view.label}</div>
                  {image ? (
                    <>
                      <img src={image.thumbnailUrl || image.dataUrl} alt={`${preset.name} ${view.label}`} />
                      <div className={styles.imageTools}>
                        <button
                          className={image.id === repId ? styles.repActive : ""}
                          title="대표 이미지"
                          onClick={() => setRepresentative(image.id)}
                        ><LuStar /></button>
                        <select value={image.view} aria-label="이미지 방향" onChange={(event) => changeView(image.id, event.target.value)}>
                          {VIEWS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                        </select>
                        <button title="이미지 삭제" onClick={() => deleteImage(image.id)} disabled={images.length <= 1}><LuTrash2 /></button>
                      </div>
                    </>
                  ) : (
                    <button className={styles.uploadSlot} onClick={() => requestUpload(view.id)} disabled={Boolean(uploadingView)}>
                      {uploadingView === view.id ? <LuLoaderCircle className={styles.spin} /> : <LuUpload />}
                      <span>이미지 추가</span>
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {unclassifiedImages.length > 0 && (
            <div className={styles.unclassifiedSection}>
              <div className={styles.viewLabel}>미분류 · 방향을 지정하세요</div>
              <div className={styles.viewGrid}>
                {unclassifiedImages.map((image) => (
                  <article className={styles.viewSlot} key={image.id}>
                    <img src={image.thumbnailUrl || image.dataUrl} alt={`${preset.name} 미분류`} />
                    <div className={styles.imageTools}>
                      <button
                        className={image.id === repId ? styles.repActive : ""}
                        title="대표 이미지"
                        onClick={() => setRepresentative(image.id)}
                      ><LuStar /></button>
                      <select
                        value="reference"
                        aria-label="이미지 방향"
                        onChange={(event) => changeView(image.id, event.target.value)}
                      >
                        <option value="reference">미분류</option>
                        {VIEWS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                      </select>
                      <button title="이미지 삭제" onClick={() => deleteImage(image.id)} disabled={images.length <= 1}><LuTrash2 /></button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadImage(file, pendingView);
              event.target.value = "";
            }}
          />
        </section>

        <section className={styles.section}>
          <h3>설명</h3>
          <textarea value={description} maxLength={5_000} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>캐릭터 음성</h3>
            <span className={styles.provider}>Google Chirp 3 HD</span>
          </div>
          <div className={styles.searchBox}>
            <LuSearch />
            <input
              value={voiceQuery}
              placeholder="밝고 친근한 여성 목소리"
              onChange={(event) => setVoiceQuery(event.target.value)}
            />
          </div>
          <input
            className={styles.previewText}
            value={previewText}
            maxLength={240}
            aria-label="음성 미리듣기 문장"
            onChange={(event) => setPreviewText(event.target.value)}
          />
          {selectedVoices.length > 0 && (
            <div className={styles.selectedVoiceList}>
              {selectedVoices.map((voice, index) => (
                <div key={voice.voiceId} className={styles.selectedVoiceRow}>
                  <span className={styles.selectedVoiceLabel}>
                    {index === 0 && <span className={styles.defaultBadge}>기본</span>}
                    {voice.label}
                  </span>
                  {index !== 0 && (
                    <button type="button" onClick={() => makeDefaultVoice(voice.voiceId)} title="영상 기본 음성으로">
                      기본 지정
                    </button>
                  )}
                  <button type="button" onClick={() => removeVoice(voice.voiceId)} title="음성 제거"><LuX size={14} /></button>
                </div>
              ))}
              <small className={styles.voiceHint}>첫 번째 음성이 영상 기본값으로 사용됩니다. (최대 {MAX_VOICES}개)</small>
            </div>
          )}
          <div className={styles.voiceGrid}>
            {visibleVoices.length > 0 ? visibleVoices.map((voice) => {
              const selected = isVoiceSelected(voice.voiceId);
              return (
                <div
                  key={voice.voiceId}
                  className={selected ? styles.voiceSelected : styles.voiceOption}
                >
                  <button
                    className={styles.voiceSelect}
                    onClick={() => toggleVoice(voice)}
                    disabled={!selected && selectedVoices.length >= MAX_VOICES}
                    title={!selected && selectedVoices.length >= MAX_VOICES ? `음성은 최대 ${MAX_VOICES}개까지 선택할 수 있습니다.` : undefined}
                  >
                    {selected && <LuCheck size={13} />}
                    <strong>{voice.label}</strong><small>{voice.description}</small>
                  </button>
                  <button type="button" className={styles.voicePreview} title="미리듣기" onClick={() => previewVoice(voice)}>
                    {previewingVoice === voice.voiceId ? <LuLoaderCircle className={styles.spin} /> : <LuCirclePlay />}
                    <CreditCostBadge credits={AI_CREDIT_COSTS.tts} />
                  </button>
                </div>
              );
            }) : <p className={styles.noVoice}>검색 결과가 없습니다.</p>}
          </div>
        </section>

        <footer className={styles.footer}>
          <button className={styles.deletePresetButton} onClick={() => void deletePreset()} disabled={deletingPreset || savingSettings}>
            {deletingPreset ? <LuLoaderCircle className={styles.spin} /> : <LuTrash2 />} 캐릭터 삭제
          </button>
          <div className={styles.footerActions}>
            <button onClick={onClose} disabled={deletingPreset}>닫기</button>
            <button className={styles.saveButton} onClick={saveSettings} disabled={savingSettings || deletingPreset}>
              {savingSettings ? <LuLoaderCircle className={styles.spin} /> : <LuSave />} 설정 저장
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
