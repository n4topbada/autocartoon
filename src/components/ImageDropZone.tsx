"use client";

import { useRef, useState, useCallback } from "react";
import styles from "./ImageDropZone.module.css";

export interface ImageData {
  base64: string;
  mimeType: string;
  preview: string;
}

interface ImageDropZoneProps {
  onImageSelect: (image: ImageData) => void;
  currentImage?: string | null;
  label?: string;
  disabled?: boolean;
  placeholderText?: string;
}

export default function ImageDropZone({
  onImageSelect,
  currentImage,
  label,
  disabled,
  placeholderText = "이미지 업로드\n(클릭, 드래그, 붙여넣기)",
}: ImageDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(",");
        const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
        onImageSelect({ base64, mimeType, preview: dataUrl });
      };
      reader.readAsDataURL(file);
    },
    [onImageSelect]
  );

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = () => {
    if (!disabled) setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFile(e.target.files[0]);
      e.target.value = "";
    }
  };

  const className = [
    styles.dropZone,
    dragOver ? styles.dragOver : "",
    disabled ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {currentImage ? (
        <>
          <img src={currentImage} alt="preview" className={styles.preview} />
          {label && <span className={styles.label}>{label}</span>}
        </>
      ) : (
        <div className={styles.placeholder}>
          <svg
            className={styles.placeholderIcon}
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className={styles.placeholderText}>
            {placeholderText.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < placeholderText.split("\n").length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className={styles.fileInput}
      />
    </div>
  );
}
