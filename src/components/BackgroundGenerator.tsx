"use client";

import { useState, useCallback, useEffect } from "react";
import { LuDownload, LuMaximize2, LuRefreshCw, LuRotateCcw, LuSave } from "react-icons/lu";
import type { ImageData } from "./ImageDropZone";
import WorkflowCard from "./WorkflowCard";
import ImageModal from "./ImageModal";
import styles from "./BackgroundGenerator.module.css";

interface CardEntry {
  id: number;
  initialImage?: ImageData;
}

interface SavingImage {
  base64?: string;
  artifactId?: string;
  url?: string;
  mimeType: string;
}

interface BackgroundHistoryArtifact {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
}

interface BackgroundHistoryJob {
  id: string;
  prompt: string;
  createdAt: string;
  artifacts: BackgroundHistoryArtifact[];
}

interface SavedBackgroundResult {
  id: string;
  name: string;
  dataUrl: string;
  thumbnailUrl?: string;
}

interface BackgroundGeneratorProps {
  active?: boolean;
  onBackgroundSaved?: (background: SavedBackgroundResult) => void;
}

export default function BackgroundGenerator({ active = true, onBackgroundSaved }: BackgroundGeneratorProps) {
  const [cards, setCards] = useState<CardEntry[]>([{ id: 1 }]);
  const [nextId, setNextId] = useState(2);
  const [modalSrc, setModalSrc] = useState<string | null>(null);

  // 저장 모달 상태
  const [savingImage, setSavingImage] = useState<SavingImage | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [history, setHistory] = useState<BackgroundHistoryJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async (showLoading = false) => {
    if (showLoading) setHistoryLoading(true);
    try {
      const response = await fetch("/api/jobs?kind=background&status=succeeded&limit=20", { cache: "no-store" });
      const data = await response.json() as { jobs?: BackgroundHistoryJob[]; error?: string };
      if (!response.ok) throw new Error(data.error || "배경 기록을 불러오지 못했습니다.");
      setHistory(data.jobs || []);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "배경 기록을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadHistory(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadHistory();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [active, loadHistory]);

  const addCard = useCallback(() => {
    setCards((prev) => [{ id: nextId }, ...prev]);
    setNextId((n) => n + 1);
  }, [nextId]);

  const continueFromHistory = useCallback((artifact: BackgroundHistoryArtifact) => {
    setCards((previous) => [{
      id: nextId,
      initialImage: {
        artifactId: artifact.id,
        mimeType: artifact.mimeType,
        preview: artifact.blobUrl,
      },
    }, ...previous]);
    setNextId((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nextId]);

  const deleteCard = useCallback((id: number) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    if (confirm("모든 작업 카드를 삭제하시겠습니까?")) {
      setCards([]);
    }
  }, []);

  const openPreview = useCallback((src: string) => {
    setModalSrc(src);
  }, []);

  const closePreview = useCallback(() => {
    setModalSrc(null);
  }, []);

  const handleSaveBackground = useCallback((image: SavingImage) => {
    setSavingImage(image);
    setSaveName(`배경_${Date.now().toString(36)}`);
    setSaveSuccess(false);
  }, []);

  const confirmSave = async () => {
    if (!savingImage || !saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          ...(savingImage.artifactId ? { artifactId: savingImage.artifactId } : { imageData: savingImage.base64 }),
          mimeType: savingImage.mimeType,
        }),
      });
      const saved = await res.json().catch(() => ({})) as SavedBackgroundResult & { error?: string };
      if (!res.ok) throw new Error(saved.error || "저장 실패");
      onBackgroundSaved?.(saved);
      setSaveSuccess(true);
      setTimeout(() => {
        setSavingImage(null);
        setSaveSuccess(false);
      }, 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const historyItems = history.flatMap((job) =>
    job.artifacts
      .filter((artifact) => artifact.mimeType.startsWith("image/"))
      .map((artifact) => ({ job, artifact }))
  );

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        {cards.length > 0 && (
          <div className={styles.topBar}>
            <button className={styles.addBtn} onClick={addCard}>
              새 배경 추가
            </button>
            <button className={styles.clearBtn} onClick={clearAll}>
              전체 삭제
            </button>
          </div>
        )}

        {cards.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎨</div>
            <div className={styles.emptyTitle}>배경 생성을 시작하세요</div>
            <p className={styles.emptyDesc}>
              사진에서 배경을 추출하고, 일러스트 스타일로 변환하고, 다양한 앵글을 생성합니다.
            </p>
            <button className={styles.addBtn} onClick={addCard}>
              새 배경 추가
            </button>
          </div>
        ) : (
          <div className={styles.cardList}>
            {cards.map((card) => (
              <WorkflowCard
                key={card.id}
                id={card.id}
                initialImage={card.initialImage}
                onDelete={() => deleteCard(card.id)}
                onPreview={openPreview}
                onSaveBackground={handleSaveBackground}
                onJobComplete={() => void loadHistory()}
              />
            ))}
          </div>
        )}

        <section className={styles.history} aria-labelledby="background-history-title">
          <div className={styles.historyHeader}>
            <div>
              <h2 id="background-history-title">최근 생성 결과</h2>
              <span>{historyItems.length}개</span>
            </div>
            <button type="button" title="최근 결과 새로고침" onClick={() => void loadHistory(true)} disabled={historyLoading}>
              <LuRefreshCw className={historyLoading ? styles.spin : ""} />
            </button>
          </div>
          {historyError ? (
            <div className={styles.historyMessage}>{historyError}</div>
          ) : historyLoading && historyItems.length === 0 ? (
            <div className={styles.historyMessage}>불러오는 중</div>
          ) : historyItems.length === 0 ? (
            <div className={styles.historyMessage}>아직 완료된 배경 생성이 없습니다.</div>
          ) : (
            <div className={styles.historyGrid}>
              {historyItems.map(({ job, artifact }) => (
                <article className={styles.historyItem} key={artifact.id}>
                  <button
                    type="button"
                    className={styles.historyPreview}
                    onClick={() => openPreview(artifact.blobUrl)}
                    aria-label={`${job.prompt.slice(0, 80)} 미리보기`}
                  >
                    <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="" />
                  </button>
                  <div className={styles.historyMeta}>
                    <p title={job.prompt}>{job.prompt}</p>
                    <time>{new Date(job.createdAt).toLocaleString("ko-KR")}</time>
                  </div>
                  <div className={styles.historyActions}>
                    <button
                      type="button"
                      title="이 결과로 이어서 작업"
                      onClick={() => continueFromHistory(artifact)}
                    >
                      <LuRotateCcw />
                    </button>
                    <button type="button" title="미리보기" onClick={() => openPreview(artifact.blobUrl)}><LuMaximize2 /></button>
                    <a href={artifact.blobUrl} download={`background-${artifact.id}.png`} title="다운로드"><LuDownload /></a>
                    <button
                      type="button"
                      title="내 배경에 저장"
                      onClick={() => handleSaveBackground({ artifactId: artifact.id, url: artifact.blobUrl, mimeType: artifact.mimeType })}
                    >
                      <LuSave />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {modalSrc && <ImageModal src={modalSrc} onClose={closePreview} />}

      {/* 배경 저장 모달 */}
      {savingImage && (
        <div className={styles.modalOverlay} onClick={() => !saving && setSavingImage(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {saveSuccess ? "저장 완료!" : "배경 저장"}
            </h2>

            <div className={styles.modalPreview}>
              <img
                src={savingImage.url || `data:${savingImage.mimeType};base64,${savingImage.base64 || ""}`}
                alt="저장할 배경"
              />
            </div>

            {!saveSuccess && (
              <>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>배경 이름</label>
                  <input
                    className={styles.modalInput}
                    placeholder="배경 이름을 입력하세요"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className={styles.modalActions}>
                  <button
                    className={styles.modalCancel}
                    onClick={() => setSavingImage(null)}
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    className={styles.modalConfirm}
                    onClick={confirmSave}
                    disabled={saving || !saveName.trim()}
                  >
                    {saving ? "저장 중..." : "저장하기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
