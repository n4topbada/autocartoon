"use client";

import { useState, useCallback } from "react";
import WorkflowCard from "./WorkflowCard";
import ImageModal from "./ImageModal";
import styles from "./BackgroundGenerator.module.css";

interface CardEntry {
  id: number;
}

interface SavingImage {
  base64: string;
  mimeType: string;
}

export default function BackgroundGenerator() {
  const [cards, setCards] = useState<CardEntry[]>([{ id: 1 }]);
  const [nextId, setNextId] = useState(2);
  const [modalSrc, setModalSrc] = useState<string | null>(null);

  // 저장 모달 상태
  const [savingImage, setSavingImage] = useState<SavingImage | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const addCard = useCallback(() => {
    setCards((prev) => [{ id: nextId }, ...prev]);
    setNextId((n) => n + 1);
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
          imageData: savingImage.base64,
          mimeType: savingImage.mimeType,
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
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
                onDelete={() => deleteCard(card.id)}
                onPreview={openPreview}
                onSaveBackground={handleSaveBackground}
              />
            ))}
          </div>
        )}
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
                src={`data:${savingImage.mimeType};base64,${savingImage.base64}`}
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
