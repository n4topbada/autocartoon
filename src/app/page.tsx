"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";
import BackgroundGenerator from "@/components/BackgroundGenerator";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/components/AuthProvider";
import {
  LuType,
  LuPenLine,
  LuPencil,
  LuPlus,
  LuHeart,
  LuTrash2,
  LuSparkles,
  LuStore,
  LuImage,
  LuUpload,
  LuPaintbrush,
  LuLayoutGrid,
} from "react-icons/lu";

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

interface MarketplaceItem extends Preset {
  price: number;
  owned: boolean;
}

interface GeneratedImageData {
  id: string;
  mimeType: string;
  dataUrl: string;
  favorite?: boolean;
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

interface UserOption {
  id: string;
  email: string;
  name: string | null;
}

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("character");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
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

  // 관리자: 유저 선택
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  // My Library: 즐겨찾기 필터 + 삭제 확인
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  // 마켓플레이스
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // 관리자: 유저 목록 로드
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((data: UserOption[]) => setAllUsers(data))
        .catch(() => setAllUsers([]));
    }
  }, [isAdmin]);

  // API 호출 시 userId 파라미터 생성
  const userParam = isAdmin && viewingUserId ? `userId=${viewingUserId}` : "";

  // 프리셋 목록 로드
  const loadPresets = useCallback(() => {
    setPresetsLoading(true);
    const q = userParam ? `?${userParam}` : "";
    fetch(`/api/presets${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPresets(data); })
      .catch(() => setPresets([]))
      .finally(() => setPresetsLoading(false));
  }, [userParam]);

  // 저장된 배경 로드
  const loadSavedBackgrounds = useCallback(() => {
    const q = userParam ? `?${userParam}` : "";
    fetch(`/api/backgrounds${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSavedBackgrounds(data); })
      .catch(() => setSavedBackgrounds([]));
  }, [userParam]);

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
    const params = new URLSearchParams();
    if (selectedPreset) params.set("presetId", selectedPreset.id);
    if (isAdmin && viewingUserId) params.set("userId", viewingUserId);
    if (showFavoritesOnly) params.set("favorites", "true");
    const q = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/history${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => setHistory([]));
  }, [selectedPreset, isAdmin, viewingUserId, showFavoritesOnly]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 마켓플레이스 로드
  const loadMarketplace = () => {
    setMarketplaceLoading(true);
    fetch("/api/marketplace")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMarketplaceItems(data); })
      .catch(() => setMarketplaceItems([]))
      .finally(() => setMarketplaceLoading(false));
  };

  const handleOpenMarketplace = () => {
    setMarketplaceItems([]);
    loadMarketplace();
    setShowMarketplace(true);
  };

  const handlePurchase = async (presetId: string) => {
    setPurchasing(presetId);
    try {
      const res = await fetch("/api/marketplace/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "구매 실패");
        return;
      }
      // 마켓플레이스 & 프리셋 목록 갱신
      loadMarketplace();
      loadPresets();
    } catch {
      setError("구매 중 오류 발생");
    } finally {
      setPurchasing(null);
    }
  };

  // 관리자: 유저 전환 시 선택된 프리셋 초기화
  const handleUserSwitch = (userId: string) => {
    setViewingUserId(userId === user?.id ? null : userId);
    setSelectedPreset(null);
    setResult(null);
  };

  // 즐겨찾기 토글
  const handleToggleFavorite = async (imageId: string) => {
    try {
      const res = await fetch(`/api/images/${imageId}`, { method: "PATCH" });
      if (!res.ok) return;
      const data = await res.json();
      setHistory((prev) =>
        prev.map((item) => ({
          ...item,
          images: item.images.map((img) =>
            img.id === imageId ? { ...img, favorite: data.favorite } : img
          ),
        }))
      );
    } catch { /* ignore */ }
  };

  // 이미지 삭제
  const handleDeleteImage = async (imageId: string) => {
    try {
      const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });
      if (!res.ok) return;
      setHistory((prev) =>
        prev
          .map((item) => ({
            ...item,
            images: item.images.filter((img) => img.id !== imageId),
          }))
          .filter((item) => item.images.length > 0)
      );
      setDeletingImageId(null);
    } catch { /* ignore */ }
  };

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

  const modeIcons: Record<Mode, React.ReactNode> = {
    text: <LuType size={14} />,
    sketch: <LuPenLine size={14} />,
    edit: <LuPencil size={14} />,
  };

  const modeLabels: Record<Mode, string> = {
    text: "텍스트",
    sketch: "스케치",
    edit: "편집",
  };

  return (
    <div className={styles.container}>
      {/* 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.logo}>
          <span className={styles.logoEmoji}>🍌</span>
          워니의 Autocartoon Bot
        </h1>
        <nav className={styles.tabNav} style={{ flex: 1 }}>
          <button
            className={`${styles.tab} ${activeTab === "character" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("character")}
          >
            <LuPaintbrush size={14} />
            캐릭터 생성
          </button>
          <button
            className={`${styles.tab} ${activeTab === "background" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("background")}
          >
            <LuImage size={14} />
            배경 생성
          </button>
        </nav>
        <UserAvatar />
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
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>캐릭터 선택</h2>
              <button
                className={styles.marketplaceBtn}
                onClick={handleOpenMarketplace}
                title="마켓플레이스"
              >
                <LuStore size={14} />
                마켓
              </button>
            </div>
            <div className={styles.presetGrid}>
              {/* 새 캐릭터 추가 버튼 */}
              <button
                className={styles.presetCard}
                onClick={() => setShowUploadModal(true)}
              >
                <div className={styles.presetThumbSingle}>
                  <LuPlus size={24} className={styles.addIcon} />
                </div>
                <span className={styles.presetName}>새 캐릭터</span>
              </button>

              {presetsLoading ? (
                <div className={styles.loadingSpinner}>
                  <span className={styles.spinner} />
                  <span>불러오는 중...</span>
                </div>
              ) : (
                presets.map((p) => (
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
                ))
              )}
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
                  {modeIcons[m]}
                  {modeLabels[m]}
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
                <LuUpload size={14} />
                이미지 선택
              </button>
              {inputImage && (
                <div className={styles.uploadPreview}>
                  <img src={inputImage.preview} alt="uploaded" />
                  <button
                    className={styles.removeBtn}
                    onClick={() => setInputImage(null)}
                  >
                    <LuTrash2 size={12} /> 제거
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
            <LuSparkles size={16} />
            {generating ? "생성 중..." : "이미지 생성"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </aside>

        {/* 우측: 결과 + 히스토리 */}
        <div className={styles.content}>
          {/* 생성 결과 */}
          {result && result.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <LuSparkles size={14} /> 생성 결과
              </h2>
              <div className={styles.resultGrid}>
                {result.map((img) => (
                  <div key={img.id} className={styles.resultCard}>
                    <img src={img.dataUrl} alt="generated" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* My Library */}
          <section className={styles.section}>
            <div className={styles.libraryHeader}>
              <h2 className={styles.sectionTitle}>
                <LuLayoutGrid size={14} /> My Library
              </h2>
              <button
                className={`${styles.favFilterBtn} ${showFavoritesOnly ? styles.favFilterActive : ""}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                title={showFavoritesOnly ? "전체 보기" : "즐겨찾기만"}
              >
                <LuHeart size={14} />
              </button>
              {isAdmin && allUsers.length > 0 && (
                <select
                  className={styles.userSelect}
                  value={viewingUserId || user?.id || ""}
                  onChange={(e) => handleUserSwitch(e.target.value)}
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email.split("@")[0]} ({u.email})
                    </option>
                  ))}
                </select>
              )}
            </div>
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
                        <div key={img.id} className={styles.imageWrapper}>
                          <img
                            src={img.dataUrl}
                            alt="history"
                            className={styles.historyThumb}
                          />
                          <div className={styles.imageActions}>
                            <button
                              className={`${styles.imageActionBtn} ${img.favorite ? styles.imageFavorited : ""}`}
                              onClick={() => handleToggleFavorite(img.id)}
                              title={img.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                            >
                              <LuHeart size={12} />
                            </button>
                            <button
                              className={`${styles.imageActionBtn} ${styles.imageDeleteBtn}`}
                              onClick={() => setDeletingImageId(img.id)}
                              title="삭제"
                            >
                              <LuTrash2 size={12} />
                            </button>
                          </div>
                        </div>
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

      {/* 삭제 확인 모달 */}
      {deletingImageId && (
        <div
          className={styles.modalOverlay}
          onClick={() => setDeletingImageId(null)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 360 }}
          >
            <h2 className={styles.modalTitle}>
              <LuTrash2 size={18} /> 이미지 삭제
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.5 }}>
              이 이미지를 영구적으로 삭제하시겠습니까?<br />
              삭제된 이미지는 복구할 수 없습니다.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setDeletingImageId(null)}
              >
                취소
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={() => handleDeleteImage(deletingImageId)}
              >
                <LuTrash2 size={14} /> 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 마켓플레이스 모달 */}
      {showMarketplace && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowMarketplace(false)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 560, maxHeight: "80vh", overflow: "auto" }}
          >
            <h2 className={styles.modalTitle}>
              <LuStore size={18} /> 캐릭터 마켓플레이스
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              캐릭터를 구매하여 이미지 생성에 사용하세요
            </p>
            {marketplaceLoading ? (
              <div className={styles.loadingSpinner} style={{ padding: "2rem 0" }}>
                <span className={styles.spinner} />
                <span>캐릭터 목록을 불러오는 중...</span>
              </div>
            ) : marketplaceItems.length === 0 ? (
              <p className={styles.emptyText}>등록된 캐릭터가 없습니다.</p>
            ) : (
              <div className={styles.marketGrid}>
                {marketplaceItems.map((item) => (
                  <div key={item.id} className={styles.marketCard}>
                    <div className={styles.marketCardThumb}>
                      {item.images.slice(0, 1).map((img) => (
                        <img key={img.id} src={img.dataUrl} alt={item.name} />
                      ))}
                    </div>
                    <div className={styles.marketCardInfo}>
                      <span className={styles.marketCardName}>{item.name}</span>
                      <span className={styles.marketCardPrice}>
                        🍌 {item.price === 0 ? "무료" : `${item.price}`}
                      </span>
                    </div>
                    {item.owned ? (
                      <button className={styles.marketOwnedBtn} disabled>
                        보유 중
                      </button>
                    ) : (
                      <button
                        className={styles.marketBuyBtn}
                        onClick={() => handlePurchase(item.id)}
                        disabled={purchasing === item.id}
                      >
                        {purchasing === item.id ? "구매 중..." : "획득하기"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setShowMarketplace(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h2 className={styles.modalTitle}>
              <LuPlus size={18} /> 새 캐릭터 등록
            </h2>

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
                    <LuPlus size={24} />
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
