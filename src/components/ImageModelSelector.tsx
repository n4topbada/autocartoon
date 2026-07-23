"use client";

import { useEffect, useState } from "react";
import {
  IMAGE_MODEL_IDS,
  IMAGE_MODEL_PRICING,
  getDefaultImageResolution,
  getImageGenerationCredits,
  isImageResolutionSupported,
  type ImageModelId,
  type ImageResolution,
} from "@/lib/ai-pricing";
import styles from "./ImageModelSelector.module.css";

interface ImageModelSelectorProps {
  modelId: ImageModelId;
  resolution: ImageResolution;
  onModelChange: (modelId: ImageModelId) => void;
  onResolutionChange: (resolution: ImageResolution) => void;
  count?: number;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export default function ImageModelSelector({
  modelId,
  resolution,
  onModelChange,
  onResolutionChange,
  count = 1,
  disabled = false,
  compact = false,
  className = "",
}: ImageModelSelectorProps) {
  const [configuredModels, setConfiguredModels] = useState<Partial<Record<ImageModelId, boolean>>>({});

  useEffect(() => {
    let active = true;
    void fetch("/api/ai/image-models", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { models?: Array<{ id: ImageModelId; configured: boolean }> };
        if (!active || !Array.isArray(data.models)) return;
        setConfiguredModels(Object.fromEntries(data.models.map((model) => [model.id, model.configured])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const changeModel = (nextModelId: ImageModelId) => {
    onModelChange(nextModelId);
    if (!isImageResolutionSupported(nextModelId, resolution)) {
      onResolutionChange(getDefaultImageResolution(nextModelId));
    }
  };

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ""} ${className}`.trim()}>
      <label className={styles.modelField}>
        <span>이미지 모델</span>
        <select
          value={modelId}
          disabled={disabled}
          onChange={(event) => changeModel(event.target.value as ImageModelId)}
        >
          {IMAGE_MODEL_IDS.map((id) => {
            const model = IMAGE_MODEL_PRICING[id];
            const minCredits = getImageGenerationCredits(id, model.supportedResolutions[0], count);
            const configured = configuredModels[id];
            const unavailable = model.availability !== "available" || configured === false;
            return (
              <option key={id} value={id} disabled={unavailable}>
                {model.label} · {minCredits}C부터
                {model.availability === "planned" ? " · 연결 예정" : configured === false ? " · API 설정 필요" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <fieldset className={styles.resolutionField} disabled={disabled}>
        <legend>해상도</legend>
        <div>
          {(["1K", "2K"] as const).map((value) => {
            const supported = isImageResolutionSupported(modelId, value);
            const credits = supported ? getImageGenerationCredits(modelId, value, count) : null;
            return (
              <button
                type="button"
                key={value}
                aria-pressed={resolution === value}
                disabled={!supported || disabled}
                onClick={() => onResolutionChange(value)}
                title={supported ? `${credits} 크레딧` : "이 모델에서 지원하지 않음"}
              >
                <strong>{value}</strong>
                <small>{credits === null ? "미지원" : `${credits}C`}</small>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
