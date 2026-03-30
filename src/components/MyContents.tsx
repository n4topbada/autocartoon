"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./MyContents.module.css";
import {
  LuPlus,
  LuTrash2,
  LuChevronLeft,
  LuGripVertical,
  LuX,
  LuFileText,
} from "react-icons/lu";

interface SlotData {
  id: string;
  imageId: string;
  imageUrl: string | null; // mapped from API's blobUrl
  order: number;
}

interface ContentSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  slotCount: number;
  updatedAt: string;
}

interface ContentDetail {
  id: string;
  title: string;
  comment: string;
  updatedAt: string;
  slots: SlotData[];
}

interface GalleryImage {
  id: string;
  dataUrl: string;
}

interface Props {
  galleryImages: GalleryImage[];
}

export default function MyContents({ galleryImages }: Props) {
  const [contents, setContents] = useState<ContentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contents");
      if (res.ok) setContents(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadContents(); }, [loadContents]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/contents/${id}`);
      if (res.ok) {
        const data = await res.json();
        // API returns blobUrl, map to imageUrl for component
        setDetail({
          ...data,
          slots: (data.slots || []).map((s: { id: string; imageId: string; blobUrl?: string; order: number }) => ({
            id: s.id,
            imageId: s.imageId,
            imageUrl: s.blobUrl || null,
            order: s.order,
          })),
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreate = async () => {
    const res = await fetch("/api/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const created = await res.json();
      loadContents();
      setSelectedId(created.id);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 콘텐츠를 삭제하시겠습니까?")) return;
    await fetch(`/api/contents/${id}`, { method: "DELETE" });
    setSelectedId(null);
    loadContents();
  };

  const handleUpdateMeta = async (updates: { title?: string; comment?: string }) => {
    if (!detail) return;
    setSaving(true);
    await fetch(`/api/contents/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    loadDetail(detail.id);
    loadContents();
    setSaving(false);
  };

  const handleAddSlot = async (imageId: string, order?: number) => {
    if (!detail) return;
    if (detail.slots.length >= 20) return;
    const insertOrder = order ?? detail.slots.length;
    await fetch(`/api/contents/${detail.id}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, order: insertOrder }),
    });
    loadDetail(detail.id);
    loadContents();
  };

  const handleRemoveSlot = async (slotId: string) => {
    if (!detail) return;
    await fetch(`/api/contents/${detail.id}/slots/${slotId}`, { method: "DELETE" });
    loadDetail(detail.id);
    loadContents();
  };

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    if (!detail) return;
    const newSlots = [...detail.slots];
    const [moved] = newSlots.splice(fromIdx, 1);
    newSlots.splice(toIdx, 0, moved);
    const reordered = newSlots.map((s, i) => ({ id: s.id, order: i }));
    setDetail({ ...detail, slots: newSlots.map((s, i) => ({ ...s, order: i })) });
    await fetch(`/api/contents/${detail.id}/slots`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots: reordered }),
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // 드래그 상태
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // ─── 콘텐츠 상세 뷰 ───
  if (detail) {
    return (
      <div className={styles.container}>
        <div className={styles.mainPanel}>
          {/* 헤더 */}
          <div className={styles.detailHeader}>
            <button className={styles.backBtn} onClick={() => setSelectedId(null)}>
              <LuChevronLeft size={16} /> 목록
            </button>
            <input
              className={styles.titleInput}
              value={detail.title}
              onChange={(e) => setDetail({ ...detail, title: e.target.value })}
              onBlur={() => handleUpdateMeta({ title: detail.title })}
              placeholder="콘텐츠 제목"
            />
            <button className={styles.deleteBtn} onClick={() => handleDelete(detail.id)}>
              <LuTrash2 size={14} />
            </button>
          </div>

          {/* 슬롯 영역 */}
          <div className={styles.slotsArea}>
            <div className={styles.slotsScroll}>
              {detail.slots.map((slot, idx) => (
                <div
                  key={slot.id}
                  className={`${styles.slot} ${dragIdx === idx ? styles.slotDragging : ""}`}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    // 갤러리에서 드롭
                    const imgId = e.dataTransfer.getData("text/plain");
                    const galleryImg = galleryImages.find((g) => g.id === imgId);
                    if (galleryImg) {
                      handleAddSlot(galleryImg.id, idx);
                      return;
                    }
                    // 슬롯 순서 변경
                    if (dragIdx !== null && dragIdx !== idx) {
                      handleReorder(dragIdx, idx);
                    }
                    setDragIdx(null);
                  }}
                  onDragEnd={() => setDragIdx(null)}
                >
                  <span className={styles.slotNumber}>{idx + 1}</span>
                  {slot.imageUrl ? (
                    <img
                      src={slot.imageUrl}
                      alt={`slot-${idx}`}
                      className={styles.slotImg}
                      onClick={() => window.open(slot.imageUrl!, "_blank")}
                    />
                  ) : (
                    <div className={styles.slotEmpty}>이미지 없음</div>
                  )}
                  <button
                    className={styles.slotRemove}
                    onClick={() => handleRemoveSlot(slot.id)}
                  >
                    <LuX size={12} />
                  </button>
                  <LuGripVertical size={12} className={styles.slotGrip} />
                </div>
              ))}
              {/* 추가 슬롯 */}
              {detail.slots.length < 20 && (
                <div
                  className={styles.addSlot}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const imgId = e.dataTransfer.getData("text/plain");
                    const galleryImg = galleryImages.find((g) => g.id === imgId);
                    if (galleryImg) handleAddSlot(galleryImg.id);
                  }}
                >
                  <LuPlus size={20} />
                  <span>드래그 또는 클릭</span>
                </div>
              )}
            </div>
          </div>

          {/* 코멘트 */}
          <div className={styles.commentSection}>
            <textarea
              className={styles.commentInput}
              value={detail.comment}
              onChange={(e) => setDetail({ ...detail, comment: e.target.value })}
              onBlur={() => handleUpdateMeta({ comment: detail.comment })}
              placeholder="코멘트를 입력하세요..."
              rows={3}
            />
            <span className={styles.timestamp}>
              {saving ? "저장 중..." : `마지막 수정: ${formatDate(detail.updatedAt)}`}
            </span>
          </div>
        </div>

        {/* 우측: 갤러리 */}
        <div className={styles.galleryPanel}>
          <h4 className={styles.galleryTitle}>My Gallery</h4>
          <div className={styles.galleryList}>
            {galleryImages.map((img) => (
              <div
                key={img.id}
                className={styles.galleryItem}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", img.id);
                }}
              >
                <img src={img.dataUrl} alt="" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── 콘텐츠 목록 뷰 ───
  return (
    <div className={styles.container}>
      <div className={styles.mainPanel}>
        <div className={styles.listHeader}>
          <h2 className={styles.listTitle}>
            <LuFileText size={16} /> My Contents
          </h2>
          <button className={styles.createBtn} onClick={handleCreate}>
            <LuPlus size={14} /> 새 콘텐츠
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>불러오는 중...</div>
        ) : contents.length === 0 ? (
          <div className={styles.empty}>
            <p>아직 콘텐츠가 없습니다.</p>
            <button className={styles.createBtn} onClick={handleCreate}>
              <LuPlus size={14} /> 첫 콘텐츠 만들기
            </button>
          </div>
        ) : (
          <div className={styles.contentGrid}>
            {contents.map((c) => (
              <div key={c.id} className={styles.contentCard} onClick={() => setSelectedId(c.id)}>
                <div className={styles.contentThumb}>
                  {c.thumbnailUrl ? (
                    <img src={c.thumbnailUrl} alt="" />
                  ) : (
                    <LuFileText size={24} />
                  )}
                </div>
                <div className={styles.contentInfo}>
                  <span className={styles.contentTitle}>{c.title}</span>
                  <span className={styles.contentMeta}>
                    {c.slotCount}장 · {formatDate(c.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 우측: 갤러리 (목록 뷰에서도 표시) */}
      <div className={styles.galleryPanel}>
        <h4 className={styles.galleryTitle}>My Gallery</h4>
        <div className={styles.galleryList}>
          {galleryImages.map((img) => (
            <div key={img.id} className={styles.galleryItem}>
              <img src={img.dataUrl} alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
