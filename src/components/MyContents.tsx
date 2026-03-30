"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./MyContents.module.css";
import { LuPlus, LuTrash2, LuX, LuGripVertical, LuFileText } from "react-icons/lu";

interface SlotData {
  id: string;
  imageId: string;
  imageUrl: string | null;
  order: number;
}

interface ContentRow {
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
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 전체 목록 + 상세를 한번에 로드
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetch("/api/contents");
      if (!listRes.ok) return;
      const list = await listRes.json();

      // 각 콘텐츠의 상세를 병렬 로드
      const details = await Promise.all(
        list.map(async (c: { id: string }) => {
          const res = await fetch(`/api/contents/${c.id}`);
          if (!res.ok) return null;
          const data = await res.json();
          return {
            id: data.id,
            title: data.title,
            comment: data.comment,
            updatedAt: data.updatedAt,
            slots: (data.slots || []).map((s: { id: string; imageId: string; blobUrl?: string; order: number }) => ({
              id: s.id,
              imageId: s.imageId,
              imageUrl: s.blobUrl || null,
              order: s.order,
            })),
          } as ContentRow;
        })
      );
      setContents(details.filter(Boolean) as ContentRow[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCreate = async () => {
    // 낙관적: 즉시 빈 행 추가
    const tempId = `temp_${Date.now()}`;
    const newRow: ContentRow = {
      id: tempId,
      title: "새 콘텐츠",
      comment: "",
      updatedAt: new Date().toISOString(),
      slots: [],
    };
    setContents((prev) => [newRow, ...prev]);

    // 서버 생성 후 실제 ID로 교체
    const res = await fetch("/api/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const created = await res.json();
      setContents((prev) => prev.map((c) => c.id === tempId ? { ...newRow, id: created.id } : c));
    } else {
      setContents((prev) => prev.filter((c) => c.id !== tempId));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 콘텐츠를 삭제하시겠습니까?")) return;
    await fetch(`/api/contents/${id}`, { method: "DELETE" });
    setContents((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateMeta = async (id: string, updates: { title?: string; comment?: string }) => {
    await fetch(`/api/contents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    // 낙관적: updatedAt 갱신
    setContents((prev) => prev.map((c) => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
  };

  const handleAddSlot = async (contentId: string, imageId: string, order?: number) => {
    const content = contents.find((c) => c.id === contentId);
    if (!content || content.slots.length >= 20) return;

    const insertOrder = order ?? content.slots.length;
    // 갤러리에서 이미지 URL 찾기 (낙관적 표시용)
    const galleryImg = galleryImages.find((g) => g.id === imageId);
    const tempId = `temp_${Date.now()}`;

    // 낙관적 업데이트: 즉시 슬롯 추가
    setContents((prev) => prev.map((c) => {
      if (c.id !== contentId) return c;
      const newSlots = [...c.slots];
      newSlots.splice(insertOrder, 0, {
        id: tempId,
        imageId,
        imageUrl: galleryImg?.dataUrl || null,
        order: insertOrder,
      });
      return { ...c, slots: newSlots.map((s, i) => ({ ...s, order: i })) };
    }));

    // 서버 동기화 (백그라운드)
    fetch(`/api/contents/${contentId}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, order: insertOrder }),
    }).then(() => {
      // 서버에서 실제 ID를 가져오기 위해 해당 콘텐츠만 리로드
      fetch(`/api/contents/${contentId}`).then((r) => r.json()).then((data) => {
        setContents((prev) => prev.map((c) => {
          if (c.id !== contentId) return c;
          return {
            ...c,
            updatedAt: data.updatedAt,
            slots: (data.slots || []).map((s: { id: string; imageId: string; blobUrl?: string; order: number }) => ({
              id: s.id, imageId: s.imageId, imageUrl: s.blobUrl || null, order: s.order,
            })),
          };
        }));
      });
    }).catch(() => loadAll());
  };

  const handleRemoveSlot = async (contentId: string, slotId: string) => {
    await fetch(`/api/contents/${contentId}/slots/${slotId}`, { method: "DELETE" });
    setContents((prev) => prev.map((c) =>
      c.id === contentId ? { ...c, slots: c.slots.filter((s) => s.id !== slotId) } : c
    ));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className={styles.container}>
      {/* 메인: 콘텐츠 행들 */}
      <div className={styles.mainPanel}>
        <div className={styles.topBar}>
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
          <div className={styles.contentRows}>
            {contents.map((content) => (
              <div key={content.id} className={styles.contentRow}>
                {/* 행 헤더: 제목 + 코멘트 + 삭제 */}
                <div className={styles.rowHeader}>
                  <input
                    className={styles.rowTitle}
                    value={content.title}
                    onChange={(e) => setContents((prev) => prev.map((c) => c.id === content.id ? { ...c, title: e.target.value } : c))}
                    onBlur={() => handleUpdateMeta(content.id, { title: content.title })}
                    placeholder="콘텐츠 제목"
                  />
                  <span className={styles.rowMeta}>
                    {content.slots.length}장 · {formatDate(content.updatedAt)}
                  </span>
                  <button className={styles.rowDeleteBtn} onClick={() => handleDelete(content.id)}>
                    <LuTrash2 size={12} />
                  </button>
                </div>

                {/* 슬롯 가로 스크롤 */}
                <div className={styles.slotsScroll}>
                  {content.slots.map((slot, idx) => (
                    <div
                      key={slot.id}
                      className={styles.slot}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const imgId = e.dataTransfer.getData("text/plain");
                        if (galleryImages.find((g) => g.id === imgId)) {
                          handleAddSlot(content.id, imgId, idx);
                        }
                      }}
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
                        <div className={styles.slotEmpty}>없음</div>
                      )}
                      <button className={styles.slotRemove} onClick={() => handleRemoveSlot(content.id, slot.id)}>
                        <LuX size={10} />
                      </button>
                    </div>
                  ))}
                  {/* 추가 슬롯 */}
                  {content.slots.length < 20 && (
                    <div
                      className={styles.addSlot}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const imgId = e.dataTransfer.getData("text/plain");
                        if (galleryImages.find((g) => g.id === imgId)) {
                          handleAddSlot(content.id, imgId);
                        }
                      }}
                    >
                      <LuPlus size={16} />
                    </div>
                  )}
                </div>

                {/* 코멘트 */}
                <div className={styles.rowComment}>
                  <input
                    className={styles.commentInput}
                    value={content.comment}
                    onChange={(e) => setContents((prev) => prev.map((c) => c.id === content.id ? { ...c, comment: e.target.value } : c))}
                    onBlur={() => handleUpdateMeta(content.id, { comment: content.comment })}
                    placeholder="코멘트..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
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
