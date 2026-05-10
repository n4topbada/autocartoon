"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./CharacterManagementModal.module.css";
import { LuStar, LuX, LuUpload, LuTrash2 } from "react-icons/lu";
import { resizeFromFile } from "@/lib/image-resize";

interface PresetImageData {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string;
}

interface ManagedPreset {
  id: string;
  name: string;
  representativeImage: PresetImageData | null;
  images: PresetImageData[];
}

interface Props {
  preset: ManagedPreset;
  onClose: () => void;
  onUpdate: (updated: ManagedPreset) => void;
}

export default function CharacterManagementModal({ preset, onClose, onUpdate }: Props) {
  const [images, setImages] = useState<PresetImageData[]>(preset.images);
  const [repId, setRepId] = useState<string | null>(
    preset.representativeImage?.id ?? preset.images[0]?.id ?? null
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImages(preset.images);
    setRepId(preset.representativeImage?.id ?? preset.images[0]?.id ?? null);
  }, [preset]);

  const handleSetRepresentative = async (imageId: string) => {
    setRepId(imageId);
    try {
      await fetch(`/api/presets/${preset.id}/representative`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const repImg = images.find((img) => img.id === imageId) ?? null;
      onUpdate({ ...preset, images, representativeImage: repImg });
    } catch {
      // 실패 시 롤백
      setRepId(preset.representativeImage?.id ?? preset.images[0]?.id ?? null);
    }
  };

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const remaining = Math.max(0, 4 - images.length);
    const fileArray = Array.from(files).slice(0, remaining);
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      const imageData = await Promise.all(
        fileArray.map((file) => resizeFromFile(file))
      );

      const res = await fetch(`/api/presets/${preset.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: imageData }),
      });
      const data = await res.json();
      if (res.ok && data.images) {
        const newImages = [...images, ...data.images];
        setImages(newImages);
        onUpdate({ ...preset, images: newImages, representativeImage: images.find((img) => img.id === repId) ?? null });
      }
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  }, [images, preset, repId, onUpdate]);

  const handleDeleteImage = async (imageId: string) => {
    if (images.length <= 1) return; // 최소 1개 유지
    const newImages = images.filter((img) => img.id !== imageId);
    setImages(newImages);
    // 삭제된 이미지가 대표이미지면 첫 번째로 변경
    if (repId === imageId) {
      const newRepId = newImages[0]?.id ?? null;
      setRepId(newRepId);
      if (newRepId) {
        fetch(`/api/presets/${preset.id}/representative`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: newRepId }),
        });
      }
    }
    // 서버에서 삭제
    fetch(`/api/presets/${preset.id}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    const repImg = newImages.find((img) => img.id === (repId === imageId ? newImages[0]?.id : repId)) ?? null;
    onUpdate({ ...preset, images: newImages, representativeImage: repImg });
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} onPaste={handlePaste}>
        <div className={styles.header}>
          <h3 className={styles.title}>{preset.name} 관리</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <LuX size={18} />
          </button>
        </div>

        <p className={styles.hint}>클릭하여 대표이미지 설정 | Ctrl+V로 이미지 붙여넣기</p>

        <div className={styles.grid}>
          {images.map((img) => (
            <button
              key={img.id}
              className={`${styles.imageCard} ${img.id === repId ? styles.representative : ""}`}
              onClick={() => handleSetRepresentative(img.id)}
            >
              <img src={img.thumbnailUrl ?? img.dataUrl} alt="캐릭터 이미지" />
              {img.id === repId && (
                <span className={styles.repBadge}>
                  <LuStar size={12} />
                </span>
              )}
              {images.length > 1 && (
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                >
                  <LuTrash2 size={10} />
                </button>
              )}
            </button>
          ))}

          <button
            className={styles.addCard}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <span className={styles.uploading}>...</span>
            ) : (
              <>
                <LuUpload size={20} />
                <span>추가</span>
              </>
            )}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) handleFileUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
