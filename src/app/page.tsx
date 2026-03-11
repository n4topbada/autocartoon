"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";
import BackgroundGenerator from "@/components/BackgroundGenerator";

type Tab = "character" | "background";

interface PresetImageData {
  id: string;
  dataUrl: string;
}

interface Preset {
  id: string;
  alias: string;
  name: string;
  images: PresetImageData[];
}

interface GeneratedImageData {
  id: string;
  mimeType: string;
  dataUrl: string;
}

interface HistoryItem {
  id: string;
  mode: string;
  prompt: string;
  background: string | null;
  backgroundImageName: string | null;
  presetName: string;
  createdAt: string;
  images: GeneratedImageData[];
}

interface SavedBg {
  id: string;
  name: string;
  dataUrl: string;
}

const BACKGROUNDS = [
  "없음",
  "학교 교실",
  "카페",
  "공원",
  "도시 거리",
  "바닷가",
  "숲속",
  "우주",
  "판타지 성",
  "사무실",
];

type Mode = "text" | "sketch" | "edit";

interface UploadingImage {
  base64: string;
  mimeType: string;
  preview: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("character");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("");
  const [background, setBackground] = useState("없음");
  const [inputImage, setInputImage] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedImageData[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 캐릭터 업로드 상태
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const charFileRef = useRef<HTMLInputElement>(null);

  // 저장된 배경 이미지
  const [savedBackgrounds, setSavedBackgrounds] = useState<SavedBg[]>([]);
  const [selectedBgImageId, setSelectedBgImageId] = useState<string | null>(null);

  // 프리셋 목록 로드
  const loadPresets = useCallback(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  // 저장된 배경 로드
  const loadSavedBackgrounds = useCallback(() => {
    fetch("/api/backgrounds")
      .then((r) => r.json())
      .then((data: SavedBg[]) => setSavedBackgrounds(data))
      .catch(() => setSavedBackgrounds([]));
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // 탭 전환 시 배경 목록 리로드
  useEffect(() => {
    if (activeTab === "character") {
      loadSavedBackgrounds();
    }
  }, [activeTab, loadSavedBackgrounds]);

  // 히스토리 로드
  const loadHistory = useCallback(() => {
    const params = selectedPreset ? `?presetId=${selectedPreset.id}` : "";
    fetch(`/api/history${params}`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [selectedPreset]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 파일 업로드 처리 (sketch/edit용)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
      setInputImage({ base64, mimeType, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // 캐릭터 이미지 추가 (업로드 모달)
  const handleCharImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = 4 - uploadingImages.length;
    const toProcess = Array.from(files).slice(0, remaining);

    toProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(",");
        const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
        setUploadingImages((prev) => {
          if (prev.length >= 4) return prev;
          return [...prev, { base64, mimeType, preview: dataUrl }];
        });
      };
      reader.readAsDataURL(file);
    });

    // 입력 리셋
    e.target.value = "";
  };

  const removeUploadingImage = (index: number) => {
    setUploadingImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 캐릭터 프리셋 생성
  const handleCreatePreset = async () => {
    if (!newCharName.trim() || uploadingImages.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCharName.trim(),
          images: uploadingImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");

      // 목록 갱신 & 새 프리셋 선택
      loadPresets();
      setSelectedPreset(data);
      setShowUploadModal(false);
      setNewCharName("");
      setUploadingImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setUploading(false);
    }
  };

  // 배경 드롭다운 변경 → 이미지 선택 해제
  const handleBgDropdown = (value: string) => {
    setBackground(value);
    if (value !== "없음") setSelectedBgImageId(null);
  };

  // 배경 이미지 선택 → 드롭다운 초기화
  const handleBgImageSelect = (id: string) => {
    if (selectedBgImageId === id) {
      setSelectedBgImageId(null);
    } else {
      setSelectedBgImageId(id);
      setBackground("없음");
    }
  };

  const handleDeleteBg = async (id: string) => {
    await fetch(`/api/backgrounds/${id}`, { method: "DELETE" });
    if (selectedBgImageId === id) setSelectedBgImageId(null);
    loadSavedBackgrounds();
  };

  // 생성 요청
  const handleGenerate = async () => {
    if (!selectedPreset || !prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        presetId: selectedPreset.id,
        mode,
        prompt: prompt.trim(),
      };
      if (selectedBgImageId) {
        body.backgroundImageId = selectedBgImageId;
      } else if (background !== "없음") {
        body.background = background;
      }
      if (inputImage && mode !== "text") {
        body.inputImage = {
          base64: inputImage.base64,
          mimeType: inputImage.mimeType,
        };
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");

      setResult(data.images);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.logo}>AutoCartoon</h1>
        <nav className={styles.tabNav}>
          <button
            className={`${styles.tab} ${activeTab === "character" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("character")}
          >
            캐릭터 생성
          </button>
          <button
            className={`${styles.tab} ${activeTab === "background" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("background")}
          >
            배경 생성
          </button>
        </nav>
      </header>

      <main className={styles.main}>
        {activeTab === "background" ? (
          <BackgroundGenerator />
        ) : (
        <>
        {/* 좌측 패널 */}
        <aside className={styles.sidebar}>
          {/* 캐릭터 선택 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>캐릭터 선택</h2>
            <div className={styles.presetGrid}>
              {/* 새 캐릭터 추가 버튼 */}
              <button
                className={styles.presetCard}
                onClick={() => setShowUploadModal(true)}
              >
                <div className={styles.presetThumbSingle}>
                  <span className={styles.addIcon}>+</span>
                </div>
                <span className={styles.presetName}>새 캐릭터</span>
              </button>

              {presets.map((p) => (
                <button
                  key={p.id}
                  className={`${styles.presetCard} ${
                    selectedPreset?.id === p.id ? styles.presetSelected : ""
                  }`}
                  onClick={() => setSelectedPreset(p)}
                >
                  <div
                    className={
                      p.images.length === 1
                        ? styles.presetThumbSingle
                        : styles.presetThumbGrid
                    }
                  >
                    {p.images.map((img) => (
                      <img key={img.id} src={img.dataUrl} alt={p.name} />
                    ))}
                  </div>
                  <span className={styles.presetName}>{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 모드 선택 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>생성 모드</h2>
            <div className={styles.modeButtons}>
              {(["text", "sketch", "edit"] as Mode[]).map((m) => (
                <button
                  key={m}
                  className={`${styles.modeBtn} ${
                    mode === m ? styles.modeBtnActive : ""
                  }`}
                  onClick={() => setMode(m)}
                >
                  {m === "text"
                    ? "텍스트"
                    : m === "sketch"
                      ? "스케치"
                      : "편집"}
                </button>
              ))}
            </div>
          </section>

          {/* 배경 선택 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>배경</h2>
            <select
              className={styles.select}
              value={background}
              onChange={(e) => handleBgDropdown(e.target.value)}
            >
              {BACKGROUNDS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>

            {/* 저장된 배경 이미지 */}
            {savedBackgrounds.length > 0 && (
              <>
                <span className={styles.bgSectionLabel}>저장된 배경</span>
                <div className={styles.bgThumbnailStrip}>
                  {savedBackgrounds.map((bg) => (
                    <button
                      key={bg.id}
                      className={`${styles.bgThumb} ${selectedBgImageId === bg.id ? styles.bgThumbSelected : ""}`}
                      onClick={() => handleBgImageSelect(bg.id)}
                      title={bg.name}
                    >
                      <img src={bg.dataUrl} alt={bg.name} />
                      <span className={styles.bgThumbName}>{bg.name}</span>
                      <button
                        className={styles.bgThumbDelete}
                        onClick={(e) => { e.stopPropagation(); handleDeleteBg(bg.id); }}
                        title="삭제"
                      >
                        ×
                      </button>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 이미지 업로드 (sketch/edit) */}
          {mode !== "text" && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {mode === "sketch" ? "스케치 업로드" : "편집할 이미지"}
              </h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className={styles.fileInput}
              />
              <button
                className={styles.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                이미지 선택
              </button>
              {inputImage && (
                <div className={styles.uploadPreview}>
                  <img src={inputImage.preview} alt="uploaded" />
                  <button
                    className={styles.removeBtn}
                    onClick={() => setInputImage(null)}
                  >
                    제거
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 프롬프트 입력 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>프롬프트</h2>
            <textarea
              className={styles.textarea}
              placeholder={
                mode === "text"
                  ? "원하는 장면을 설명하세요..."
                  : mode === "sketch"
                    ? "스케치에 대한 추가 설명..."
                    : "편집 내용을 입력하세요..."
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </section>

          {/* 생성 버튼 */}
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={generating || !selectedPreset || !prompt.trim()}
          >
            {generating ? "생성 중..." : "이미지 생성"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </aside>

        {/* 우측: 결과 + 히스토리 */}
        <div className={styles.content}>
          {/* 생성 결과 */}
          {result && result.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>생성 결과</h2>
              <div className={styles.resultGrid}>
                {result.map((img) => (
                  <div key={img.id} className={styles.resultCard}>
                    <img src={img.dataUrl} alt="generated" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 히스토리 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>생성 히스토리</h2>
            {history.length === 0 ? (
              <p className={styles.emptyText}>
                아직 생성된 이미지가 없습니다.
              </p>
            ) : (
              <div className={styles.historyList}>
                {history.map((item) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyMeta}>
                      <span className={styles.historyMode}>{item.mode}</span>
                      <span className={styles.historyPreset}>
                        {item.presetName}
                      </span>
                      <span className={styles.historyDate}>
                        {new Date(item.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    {item.backgroundImageName && (
                      <span className={styles.historyBg}>[이미지] {item.backgroundImageName}</span>
                    )}
                    {item.background && !item.backgroundImageName && (
                      <span className={styles.historyBg}>{item.background}</span>
                    )}
                    <p className={styles.historyPrompt}>{item.prompt}</p>
                    <div className={styles.historyImages}>
                      {item.images.map((img) => (
                        <img
                          key={img.id}
                          src={img.dataUrl}
                          alt="history"
                          className={styles.historyThumb}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        </>
        )}
      </main>

      {/* 캐릭터 업로드 모달 */}
      {showUploadModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>새 캐릭터 등록</h2>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>캐릭터 이름</label>
              <input
                className={styles.modalInput}
                placeholder="캐릭터 이름을 입력하세요"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
              />
            </div>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                참조 이미지 ({uploadingImages.length}/4)
              </label>

              <div className={styles.uploadGrid}>
                {uploadingImages.map((img, i) => (
                  <div key={i} className={styles.uploadGridItem}>
                    <img src={img.preview} alt={`ref-${i}`} />
                    <button
                      className={styles.uploadGridRemove}
                      onClick={() => removeUploadingImage(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {uploadingImages.length < 4 && (
                  <button
                    className={styles.uploadGridAdd}
                    onClick={() => charFileRef.current?.click()}
                  >
                    <span>+</span>
                    <span className={styles.uploadGridAddText}>추가</span>
                  </button>
                )}
              </div>

              <input
                ref={charFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleCharImageAdd}
                className={styles.fileInput}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => {
                  setShowUploadModal(false);
                  setNewCharName("");
                  setUploadingImages([]);
                }}
              >
                취소
              </button>
              <button
                className={styles.modalConfirm}
                onClick={handleCreatePreset}
                disabled={
                  uploading ||
                  !newCharName.trim() ||
                  uploadingImages.length === 0
                }
              >
                {uploading ? "등록 중..." : "등록하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
