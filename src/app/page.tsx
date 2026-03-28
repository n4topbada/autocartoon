"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import styles from "./page.module.css";
import BackgroundGenerator from "@/components/BackgroundGenerator";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/components/AuthProvider";
import {
  LuPlus,
  LuHeart,
  LuTrash2,
  LuSparkles,
  LuStore,
  LuImage,
  LuUpload,
  LuPaintbrush,
  LuUsers,
  LuLink,
  LuX,
  LuLayoutList,
  LuMessageCircle,
  LuPencil,
} from "react-icons/lu";
import { resizeFromFile, fetchImageFromUrl, type ResizedImage } from "@/lib/image-resize";
import Board from "@/components/Board";
import ChatBot from "@/components/ChatBot";
import CharacterManagementModal from "@/components/CharacterManagementModal";

type Tab = "character" | "background" | "board";

interface PresetImageData {
  id: string;
  dataUrl: string;
}

interface Preset {
  id: string;
  alias: string;
  name: string;
  groupId?: string | null;
  order?: number;
  userId?: string | null;
  representativeImage: PresetImageData | null;
  images: PresetImageData[];
}

interface CharacterGroupData {
  id: string;
  name: string;
  order: number;
  presets: Preset[];
}

interface MarketplaceItem {
  type: "preset" | "group";
  id: string;
  name: string;
  price: number;
  owned: boolean;
  characterCount: number;
  thumbnail: string | null;
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

// 개별 이미지 + 메타 (플랫 구조)
interface FlatImage {
  id: string;
  dataUrl: string;
  favorite: boolean;
  mode: string;
  presetName: string;
  prompt: string;
  createdAt: string;
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

interface UploadingImage {
  base64: string;
  mimeType: string;
  preview: string;
}

// Depth_B 가로 스크롤 컴포넌트
function DepthBScroller({
  presets,
  selectedPresets,
  onToggle,
  onManage,
  currentUserId,
}: {
  presets: Preset[];
  selectedPresets: Preset[];
  onToggle: (p: Preset) => void;
  onManage: (p: Preset) => void;
  currentUserId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };
  return (
    <div className={styles.depthBContainer}>
      <button className={styles.depthBScrollBtn} onClick={() => scroll("left")}>‹</button>
      <div className={styles.depthBScroller} ref={scrollRef}>
        {presets.map((p) => {
          const isSelected = !!selectedPresets.find((s) => s.id === p.id);
          const isOwner = p.userId === currentUserId;
          return (
            <button
              key={p.id}
              className={`${styles.presetCard} ${isSelected ? styles.presetSelected : ""}`}
              onClick={() => onToggle(p)}
            >
              <div className={styles.presetThumbSingle}>
                {(p.representativeImage ?? p.images[0]) && (
                  <img src={(p.representativeImage ?? p.images[0]).dataUrl} alt={p.name} />
                )}
                {isSelected && isOwner && (
                  <button
                    className={styles.editBtn}
                    onClick={(e) => { e.stopPropagation(); onManage(p); }}
                  >
                    <LuPencil size={10} />
                  </button>
                )}
              </div>
              <span className={styles.presetName}>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button className={styles.depthBScrollBtn} onClick={() => scroll("right")}>›</button>
    </div>
  );
}

interface SlotImage {
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
  const [charGroups, setCharGroups] = useState<CharacterGroupData[]>([]);
  const [ungroupedPresets, setUngroupedPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [selectedPresets, setSelectedPresets] = useState<Preset[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [managingPreset, setManagingPreset] = useState<Preset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [background, setBackground] = useState("없음");
  const [characterOnly, setCharacterOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 챗봇
  const [chatOpen, setChatOpen] = useState(false);

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

  // 즐겨찾기 필터 + 삭제 확인
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  // Transform 모드: 3슬롯
  const [transformSlots, setTransformSlots] = useState<(SlotImage | null)[]>([null, null, null]);
  // (URL input is now global, not per-slot)
  const transformFileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  // 캐릭터 모달
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

  // 프리셋 목록 로드 (그룹핑 구조)
  const loadPresets = useCallback(() => {
    setPresetsLoading(true);
    const q = userParam ? `?${userParam}` : "";
    fetch(`/api/presets${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const groups: CharacterGroupData[] = data.groups ?? [];
          const ungrouped: Preset[] = data.ungrouped ?? [];
          setCharGroups(groups);
          setUngroupedPresets(ungrouped);
          // 디폴트 선택
          if (selectedPresets.length === 0) {
            const allPresets = [...ungrouped, ...groups.flatMap((g: CharacterGroupData) => g.presets)];
            const wony = allPresets.find((p: Preset) => p.alias === "wony");
            if (wony) setSelectedPresets([wony]);
            else if (allPresets.length > 0) setSelectedPresets([allPresets[0]]);
          }
        } else if (Array.isArray(data)) {
          // 하위호환: 이전 flat 응답
          const mapped = data.map((p: Preset & { representativeImage?: PresetImageData | null }) => ({
            ...p,
            representativeImage: p.representativeImage ?? p.images[0] ?? null,
          }));
          setUngroupedPresets(mapped);
          setCharGroups([]);
          if (selectedPresets.length === 0 && mapped.length > 0) {
            const wony = mapped.find((p: Preset) => p.alias === "wony");
            setSelectedPresets([wony ?? mapped[0]]);
          }
        }
      })
      .catch(() => { setCharGroups([]); setUngroupedPresets([]); })
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

  useEffect(() => {
    if (activeTab === "character") {
      loadSavedBackgrounds();
    }
  }, [activeTab, loadSavedBackgrounds]);

  // 히스토리 로드 (전체 데이터, 필터는 클라이언트에서)
  const loadHistory = useCallback(() => {
    const params = new URLSearchParams();
    if (isAdmin && viewingUserId) params.set("userId", viewingUserId);
    const q = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/history${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => setHistory([]));
  }, [isAdmin, viewingUserId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 히스토리를 플랫 이미지 배열로 변환 + 클라이언트 필터링
  const flatImages: FlatImage[] = useMemo(() => {
    const all = history.flatMap((item) =>
      item.images.map((img) => ({
        id: img.id,
        dataUrl: img.dataUrl,
        favorite: !!img.favorite,
        mode: item.mode,
        presetName: item.presetName,
        prompt: item.prompt,
        createdAt: item.createdAt,
      }))
    );
    return showFavoritesOnly ? all.filter((img) => img.favorite) : all;
  }, [history, showFavoritesOnly]);

  // 캐릭터 모달 로드
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

  const handlePurchase = async (item: MarketplaceItem) => {
    setPurchasing(item.id);
    try {
      const body = item.type === "group" ? { groupId: item.id } : { presetId: item.id };
      const res = await fetch("/api/marketplace/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "구매 실패");
        return;
      }
      loadMarketplace();
      loadPresets();
    } catch {
      setError("구매 중 오류 발생");
    } finally {
      setPurchasing(null);
    }
  };

  // 관리자: 유저 전환
  const handleUserSwitch = (userId: string) => {
    setViewingUserId(userId === user?.id ? null : userId);
    setSelectedPresets([]);
  };

  // 즐겨찾기 토글 (낙관적 업데이트)
  const handleToggleFavorite = (imageId: string) => {
    // 즉시 UI 갱신
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        images: item.images.map((img) =>
          img.id === imageId ? { ...img, favorite: !img.favorite } : img
        ),
      }))
    );
    // 백그라운드로 서버 요청
    fetch(`/api/images/${imageId}`, { method: "PATCH" }).catch(() => {
      // 실패 시 원복
      setHistory((prev) =>
        prev.map((item) => ({
          ...item,
          images: item.images.map((img) =>
            img.id === imageId ? { ...img, favorite: !img.favorite } : img
          ),
        }))
      );
    });
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
      const newPreset: Preset = {
        ...data,
        representativeImage: data.representativeImage ?? data.images?.[0] ?? null,
      };
      setSelectedPresets((prev) => prev.length < 4 ? [...prev, newPreset] : prev);
      setShowUploadModal(false);
      setNewCharName("");
      setUploadingImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setUploading(false);
    }
  };

  const handleBgDropdown = (value: string) => {
    setBackground(value);
    if (value !== "없음") setSelectedBgImageId(null);
  };

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

  // Transform 슬롯: 파일 업로드
  const handleTransformFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeFromFile(file);
      setTransformSlots((prev) => {
        const next = [...prev];
        next[index] = resized;
        return next;
      });
    } catch {
      setError("이미지 로드 실패");
    }
    e.target.value = "";
  };

  // Transform 슬롯: URL 로드 (첫 번째 빈 슬롯에 자동 삽입)
  const [globalUrlInput, setGlobalUrlInput] = useState("");
  const [globalUrlLoading, setGlobalUrlLoading] = useState(false);

  const handleTransformUrlLoad = async () => {
    const url = globalUrlInput.trim();
    if (!url) return;
    const emptyIndex = transformSlots.findIndex((s) => s === null);
    if (emptyIndex === -1) { setError("모든 슬롯이 사용 중입니다."); return; }
    setGlobalUrlLoading(true);
    try {
      const resized = await fetchImageFromUrl(url);
      setTransformSlots((prev) => {
        const next = [...prev];
        next[emptyIndex] = resized;
        return next;
      });
      setGlobalUrlInput("");
    } catch {
      setError("URL 이미지 로드 실패 (CORS 제한일 수 있음)");
    } finally {
      setGlobalUrlLoading(false);
    }
  };

  // Transform 슬롯: 붙여넣기
  const handleTransformPaste = async (index: number, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const resized = await resizeFromFile(file);
          setTransformSlots((prev) => {
            const next = [...prev];
            next[index] = resized;
            return next;
          });
        } catch {
          setError("붙여넣기 이미지 처리 실패");
        }
        return;
      }
    }
  };

  // Transform 슬롯: 제거
  const handleTransformSlotRemove = (index: number) => {
    setTransformSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  // 생성 요청 (자동 모드 감지)
  // 캐릭터 토글 선택 (최대 4개)
  const togglePresetSelection = useCallback((preset: Preset) => {
    setSelectedPresets((prev) => {
      const exists = prev.find((p) => p.id === preset.id);
      if (exists) return prev.filter((p) => p.id !== preset.id);
      if (prev.length >= 4) return prev; // 최대 4개
      return [...prev, preset];
    });
  }, []);

  // 그룹 선택 (Depth_A)
  const handleGroupSelect = useCallback((group: CharacterGroupData) => {
    if (expandedGroupId === group.id) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(group.id);
    // Depth_B가 있으면 첫 번째 캐릭터 자동 선택
    if (group.presets.length > 0) {
      const firstChar = group.presets[0];
      setSelectedPresets((prev) => {
        if (prev.find((p) => p.id === firstChar.id)) return prev;
        if (prev.length >= 4) return prev;
        return [...prev, firstChar];
      });
    }
  }, [expandedGroupId]);

  // 캐릭터 선택 시 프롬프트에 트리거 워드 자동 삽입
  const prevSelectedRef = useRef<string[]>([]);
  useEffect(() => {
    const prevIds = prevSelectedRef.current;
    const currIds = selectedPresets.map((p) => p.id);
    // 새로 추가된 캐릭터만
    const added = selectedPresets.filter((p) => !prevIds.includes(p.id));
    if (added.length > 0) {
      setPrompt((prev) => {
        const names = added.map((p) => p.name);
        const addition = names.join(", ");
        return prev ? prev + ", " + addition : addition;
      });
    }
    prevSelectedRef.current = currIds;
  }, [selectedPresets]);

  const handleGenerate = async () => {
    if (selectedPresets.length === 0) return;
    const hasImages = transformSlots.some((s) => s !== null);
    const hasPrompt = prompt.trim().length > 0;
    if (!hasImages && !hasPrompt) return;

    // 자동 모드: 이미지 있으면 transform, 텍스트만이면 text
    const autoMode = hasImages ? "transform" : "text";

    setGenerating(true);
    setError(null);

    try {
      let finalPrompt = hasPrompt ? prompt.trim() : "캐릭터 스타일로 변환";
      if (characterOnly) {
        finalPrompt += "\n\n[중요] 배경은 완전히 투명하거나 순수 흰색으로 처리하고, 캐릭터만 단독으로 그려주세요. 배경 요소(풍경, 사물, 장소 등)를 절대 포함하지 마세요.";
      }

      const body: Record<string, unknown> = {
        presetIds: selectedPresets.map((p) => p.id),
        mode: autoMode,
        prompt: finalPrompt,
      };
      if (!characterOnly && selectedBgImageId) {
        body.backgroundImageId = selectedBgImageId;
      } else if (!characterOnly && background !== "없음") {
        body.background = background;
      }
      if (hasImages) {
        const imgs = transformSlots.filter((s): s is SlotImage => s !== null);
        body.inputImages = imgs.map((s) => ({ base64: s.base64, mimeType: s.mimeType }));
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
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
        <h1
          className={styles.logo}
          onClick={() => { setActiveTab("character"); window.scrollTo(0, 0); }}
          style={{ cursor: "pointer" }}
        >
          <span className={styles.logoEmoji}>🍌</span>
          워니바나나봇
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
          <button
            className={`${styles.tab} ${activeTab === "board" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("board")}
          >
            <LuLayoutList size={14} />
            게시판
          </button>
        </nav>
        <div className={styles.headerRight}>
          {isAdmin && allUsers.length > 0 && (
            <select
              className={styles.adminUserSelectCompact}
              value={viewingUserId || user?.id || ""}
              onChange={(e) => handleUserSwitch(e.target.value)}
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email.split("@")[0]}
                </option>
              ))}
            </select>
          )}
          <UserAvatar />
          <button
            className={styles.chatToggleBtn}
            onClick={() => setChatOpen(!chatOpen)}
            title="워니봇"
          >
            <img src="/robot-wony.png" alt="워니봇" className={styles.robotWonyIcon} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {activeTab === "background" ? (
          <BackgroundGenerator />
        ) : activeTab === "board" ? (
          <Board />
        ) : (
        <>
        {/* 좌측 패널 */}
        <aside className={styles.sidebar}>
          {/* 1) 참조 이미지 슬롯 (최상단) */}
          <section className={styles.section}>
            <div className={styles.refImageHeader}>
              <h2 className={styles.sectionTitle}>참조 이미지</h2>
              <div className={styles.refUrlRow}>
                <input
                  type="text"
                  className={styles.slotUrlInput}
                  placeholder="이미지 URL"
                  value={globalUrlInput}
                  onChange={(e) => setGlobalUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleTransformUrlLoad(); }}
                />
                <button
                  className={styles.slotUrlBtn}
                  onClick={() => handleTransformUrlLoad()}
                  disabled={globalUrlLoading || !globalUrlInput.trim()}
                >
                  {globalUrlLoading ? "..." : <LuLink size={12} />}
                </button>
              </div>
            </div>
              <div className={styles.transformGrid}>
                {transformSlots.map((slot, i) => (
                  <div
                    key={i}
                    className={styles.transformSlot}
                    onPaste={(e) => handleTransformPaste(i, e)}
                    tabIndex={0}
                  >
                    <span className={styles.slotNumber}>{i + 1}</span>
                    {slot ? (
                      <div className={styles.transformSlotPreview}>
                        <img src={slot.preview} alt={`slot-${i}`} />
                        <button
                          className={styles.transformSlotRemove}
                          onClick={() => handleTransformSlotRemove(i)}
                        >
                          <LuX size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className={styles.transformSlotEmpty}>
                        <input
                          ref={(el) => { transformFileRefs.current[i] = el; }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleTransformFileUpload(i, e)}
                          className={styles.fileInput}
                        />
                        <button
                          className={styles.transformSlotUploadBtn}
                          onClick={() => transformFileRefs.current[i]?.click()}
                        >
                          <LuUpload size={14} />
                          <span>Ctrl+V</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

          {/* 2) 캐릭터 선택 (2단계 그룹핑) */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>캐릭터 선택 <span className={styles.selectionCount}>({selectedPresets.length}/4)</span></h2>
              <div className={styles.sectionHeaderBtns}>
                <button
                  className={styles.textBtn}
                  onClick={() => setShowUploadModal(true)}
                >
                  <LuPlus size={12} />
                  새 캐릭터
                </button>
                <button
                  className={styles.textBtn}
                  onClick={handleOpenMarketplace}
                >
                  <LuStore size={12} />
                  캐릭터
                </button>
              </div>
            </div>

            {presetsLoading ? (
              <div className={styles.loadingSpinner}>
                <span className={styles.spinner} />
                <span>불러오는 중...</span>
              </div>
            ) : (
              <div className={styles.charGroupList}>
                {/* 모든 Depth_A를 동일한 그리드에 표시 */}
                <div className={styles.presetGrid}>
                  {/* 그룹 카드 */}
                  {charGroups.map((group) => {
                    const firstPreset = group.presets[0];
                    const thumb = firstPreset?.representativeImage ?? firstPreset?.images[0];
                    const isExpanded = expandedGroupId === group.id;
                    return (
                      <button
                        key={group.id}
                        className={`${styles.presetCard} ${isExpanded ? styles.presetSelected : ""}`}
                        onClick={() => handleGroupSelect(group)}
                      >
                        <div className={styles.presetThumbSingle}>
                          {thumb && <img src={thumb.dataUrl} alt={group.name} />}
                        </div>
                        <span className={styles.presetName}>{group.name}</span>
                      </button>
                    );
                  })}
                  {/* 독립 캐릭터 카드 */}
                  {ungroupedPresets.map((p) => {
                    const isSelected = !!selectedPresets.find((s) => s.id === p.id);
                    const isOwner = p.userId === user?.id;
                    return (
                      <button
                        key={p.id}
                        className={`${styles.presetCard} ${isSelected ? styles.presetSelected : ""}`}
                        onClick={() => togglePresetSelection(p)}
                      >
                        <div className={styles.presetThumbSingle}>
                          {(p.representativeImage ?? p.images[0]) && (
                            <img src={(p.representativeImage ?? p.images[0]).dataUrl} alt={p.name} />
                          )}
                          {isSelected && isOwner && (
                            <button
                              className={styles.editBtn}
                              onClick={(e) => { e.stopPropagation(); setManagingPreset(p); }}
                            >
                              <LuPencil size={10} />
                            </button>
                          )}
                        </div>
                        <span className={styles.presetName}>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                {/* 확장된 그룹의 Depth_B (그리드 아래에 별도 행) */}
                {charGroups.map((group) =>
                  expandedGroupId === group.id && group.presets.length > 0 ? (
                    <DepthBScroller
                      key={`depthb-${group.id}`}
                      presets={group.presets}
                      selectedPresets={selectedPresets}
                      onToggle={togglePresetSelection}
                      onManage={setManagingPreset}
                      currentUserId={user?.id}
                    />
                  ) : null
                )}
              </div>
            )}

            {/* 선택된 캐릭터 태그 */}
            {selectedPresets.length > 0 && (
              <div className={styles.selectedTags}>
                {selectedPresets.map((p) => (
                  <span key={p.id} className={styles.selectedTag}>
                    {p.name}
                    <button
                      className={styles.tagRemove}
                      onClick={() => setSelectedPresets((prev) => prev.filter((s) => s.id !== p.id))}
                    >
                      <LuX size={10} />
                    </button>
                  </span>
                ))}
                <button
                  className={styles.tagClearAll}
                  onClick={() => setSelectedPresets([])}
                >
                  모두제거
                </button>
              </div>
            )}
          </section>

          {/* 3) 배경 설정 */}
          <section className={styles.section}>
            <div className={styles.bgRow}>
              <span className={styles.bgLabel}>배경 :</span>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={characterOnly}
                  onChange={(e) => {
                    setCharacterOnly(e.target.checked);
                    if (e.target.checked) {
                      setBackground("없음");
                      setSelectedBgImageId(null);
                    }
                  }}
                />
                <span>캐릭터만</span>
              </label>
              <select
                className={styles.select}
                value={background}
                onChange={(e) => handleBgDropdown(e.target.value)}
                disabled={characterOnly}
              >
                {BACKGROUNDS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            {!characterOnly && savedBackgrounds.length > 0 && (
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

          {/* 5) 프롬프트 입력 */}
          <section className={styles.section}>
            <textarea
              className={styles.textarea}
              placeholder="이곳에 프롬프트를 입력하세요"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </section>

          {/* 6) 생성 버튼 */}
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={generating || selectedPresets.length === 0 || (!prompt.trim() && transformSlots.every((s) => s === null))}
          >
            <LuSparkles size={16} />
            {generating ? "생성 중..." : "이미지 생성"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </aside>

        {/* 우측: 통합 갤러리 */}
        <div className={styles.content}>
          <div className={styles.galleryHeader}>
            <h2 className={styles.sectionTitle}>
              <LuSparkles size={14} /> My Gallery
            </h2>
            <button
              className={`${styles.favFilterBtn} ${showFavoritesOnly ? styles.favFilterActive : ""}`}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title={showFavoritesOnly ? "전체 보기" : "즐겨찾기만"}
            >
              <LuHeart size={14} />
            </button>
          </div>

          <div className={styles.gallery}>
            {/* 생성 중 스켈레톤 */}
            {generating && (
              <div className={styles.galleryCard}>
                <div className={styles.skeletonPulse} />
                <div className={styles.galleryCaption}>
                  <span className={styles.galleryCaptionText}>생성 중...</span>
                </div>
              </div>
            )}

            {flatImages.length === 0 && !generating && (
              <p className={styles.emptyText}>
                아직 생성된 이미지가 없습니다.
              </p>
            )}

            {flatImages.map((img) => (
              <div key={img.id} className={styles.galleryCard}>
                <img src={img.dataUrl} alt="generated" className={styles.galleryImg} />
                <div className={styles.galleryCaption}>
                  <span className={styles.galleryCaptionMode}>{img.mode}</span>
                  <span className={styles.galleryCaptionText}>
                    {img.presetName} &middot; {img.prompt.length > 20 ? img.prompt.slice(0, 20) + "..." : img.prompt}
                  </span>
                </div>
                <div className={styles.galleryActions}>
                  <button
                    className={`${styles.galleryActionBtn} ${img.favorite ? styles.galleryFavorited : ""}`}
                    onClick={() => handleToggleFavorite(img.id)}
                    title={img.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  >
                    <LuHeart size={14} />
                  </button>
                  <button
                    className={`${styles.galleryActionBtn} ${styles.galleryDeleteBtn}`}
                    onClick={() => setDeletingImageId(img.id)}
                    title="삭제"
                  >
                    <LuTrash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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

      {/* 캐릭터 모달 */}
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
              <LuStore size={18} /> 캐릭터
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              사용할 캐릭터를 선택하세요
            </p>
            {marketplaceLoading ? (
              <div className={styles.loadingSpinner} style={{ padding: "2rem 0" }}>
                <span className={styles.spinner} />
                <span>불러오는 중...</span>
              </div>
            ) : marketplaceItems.length === 0 ? (
              <p className={styles.emptyText}>등록된 캐릭터가 없습니다.</p>
            ) : (
              <div className={styles.marketGrid}>
                {marketplaceItems.map((item) => (
                  <div key={item.id} className={styles.marketCard}>
                    <div className={styles.marketCardThumb}>
                      {item.thumbnail && (
                        <img src={item.thumbnail} alt={item.name} />
                      )}
                    </div>
                    <div className={styles.marketCardInfo}>
                      <span className={styles.marketCardName}>{item.name}</span>
                      <span className={styles.marketCardPrice}>
                        {item.characterCount > 1 && (
                          <span className={styles.charCount}>{item.characterCount}캐릭터 </span>
                        )}
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
                        onClick={() => handlePurchase(item)}
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

      {/* 캐릭터 관리 모달 */}
      {managingPreset && (
        <CharacterManagementModal
          preset={managingPreset}
          onClose={() => setManagingPreset(null)}
          onUpdate={(updated) => {
            // 선택 목록 갱신
            setSelectedPresets((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
            );
            // 그룹/독립 프리셋 목록 갱신
            setUngroupedPresets((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
            );
            setCharGroups((prev) =>
              prev.map((g) => ({
                ...g,
                presets: g.presets.map((p) =>
                  p.id === updated.id ? { ...p, ...updated } : p
                ),
              }))
            );
            setManagingPreset(null);
          }}
        />
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
      {/* 챗봇 패널 */}
      <ChatBot open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
