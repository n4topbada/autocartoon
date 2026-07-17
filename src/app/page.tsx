"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
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
  LuLink,
  LuX,
  LuLayoutList,
  LuPencil,
  LuDownload,
  LuTag,
  LuShare2,
  LuShieldAlert,
  LuUserRoundCog,
  LuSettings,
  LuClapperboard,
  LuFilm,
  LuPersonStanding,
  LuUsers,
  LuChevronDown,
} from "react-icons/lu";
import { resizeFromFile, fetchImageFromUrl } from "@/lib/image-resize";
import PromptInput from "@/components/PromptInput";
import CreditCostBadge from "@/components/CreditCostBadge";
import { canAccessCharacterDesigner } from "@/lib/character-designer-access";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";

function DeferredPanelLoader() {
  return (
    <div className={styles.deferredPanelLoader} role="status" aria-label="화면 불러오는 중">
      <span className={styles.spinner} />
    </div>
  );
}

const BackgroundGenerator = dynamic(() => import("@/components/BackgroundGenerator"), { loading: DeferredPanelLoader });
const Board = dynamic(() => import("@/components/Board"), { loading: DeferredPanelLoader });
const InstagramTab = dynamic(() => import("@/components/InstagramTab"), { loading: DeferredPanelLoader });
const MyContents = dynamic(() => import("@/components/MyContents"), { loading: DeferredPanelLoader });
const CharacterDesigner = dynamic(() => import("@/components/CharacterDesigner"), { loading: DeferredPanelLoader });
const CharacterCreator = dynamic(() => import("@/components/CharacterCreator"), { loading: DeferredPanelLoader });
const AccountSettings = dynamic(() => import("@/components/AccountSettings"), { loading: DeferredPanelLoader });
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), { loading: DeferredPanelLoader, ssr: false });
const CharacterManagementModal = dynamic(
  () => import("@/components/CharacterManagementModal"),
  { loading: DeferredPanelLoader },
);
const ChatBot = dynamic(() => import("@/components/ChatBot"), { loading: DeferredPanelLoader, ssr: false });
const GenerationNotifications = dynamic(() => import("@/components/GenerationNotifications"), { loading: () => null });

type Tab =
  | "character"
  | "characterCreator"
  | "designer"
  | "background"
  | "board"
  | "instagram"
  | "contents"
  | "settings";

interface PresetImageData {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string;
  view?: string;
}

interface Preset {
  id: string;
  alias: string;
  name: string;
  groupId?: string | null;
  order?: number;
  userId?: string | null;
  isDefault?: boolean;
  description?: string | null;
  voiceConfig?: Array<{ label: string; voiceId: string }> | null;
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
  thumbnailUrl?: string;
  favorite?: boolean;
  tags?: TagData[];
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
  thumbnailUrl?: string;
}

interface TagData {
  id: string;
  name: string;
  color: string;
}

// 개별 이미지 + 메타 (플랫 구조)
interface FlatImage {
  id: string;
  dataUrl: string;
  thumbnailUrl?: string;
  favorite: boolean;
  mode: string;
  presetName: string;
  prompt: string;
  createdAt: string;
  tags: TagData[];
}

const TAG_COLORS = [
  { name: "빨강", color: "#ef4444" },
  { name: "주황", color: "#f97316" },
  { name: "노랑", color: "#eab308" },
  { name: "초록", color: "#22c55e" },
  { name: "파랑", color: "#3b82f6" },
  { name: "보라", color: "#8b5cf6" },
  { name: "핑크", color: "#ec4899" },
  { name: "회색", color: "#6b7280" },
];

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
                  <img src={(p.representativeImage ?? p.images[0]).thumbnailUrl ?? (p.representativeImage ?? p.images[0]).dataUrl} alt={p.name} />
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
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("character");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [charGroups, setCharGroups] = useState<CharacterGroupData[]>([]);
  const [ungroupedPresets, setUngroupedPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [selectedPresets, setSelectedPresets] = useState<Preset[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [managingPreset, setManagingPreset] = useState<Preset | null>(null);
  const [showCharacterLibrary, setShowCharacterLibrary] = useState(false);
  const [editingImage, setEditingImage] = useState<FlatImage | null>(null);

  // 태그 시스템
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [tagMenuImageId, setTagMenuImageId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");

  const [toast, setToast] = useState<string | null>(null);

  // 프롬프트 프리셋
  const [promptPresets, setPromptPresets] = useState<{ id: string; text: string }[]>([]);
  const [showPromptPresets, setShowPromptPresets] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [background, setBackground] = useState("없음");
  const [characterOnly, setCharacterOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 챗봇
  const [chatOpen, setChatOpen] = useState(false);
  const [showDesignerAccessDenied, setShowDesignerAccessDenied] = useState(false);
  const [designerTabPending, setDesignerTabPending] = useState(false);

  useEffect(() => {
    if (user?.mustChangePassword) setActiveTab("settings");
  }, [user?.mustChangePassword]);

  const handleDesignerTabClick = useCallback(() => {
    if (authLoading) {
      setDesignerTabPending(true);
      return;
    }
    if (!canAccessCharacterDesigner(user)) {
      setShowDesignerAccessDenied(true);
      return;
    }
    setActiveTab("designer");
  }, [authLoading, user]);

  useEffect(() => {
    if (!designerTabPending || authLoading) return;
    setDesignerTabPending(false);
    if (canAccessCharacterDesigner(user)) {
      setActiveTab("designer");
    } else {
      setShowDesignerAccessDenied(true);
    }
  }, [authLoading, designerTabPending, user]);

  useEffect(() => {
    if (!showDesignerAccessDenied) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDesignerAccessDenied(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showDesignerAccessDenied]);

  // 캐릭터 업로드 상태
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [newCharPublic, setNewCharPublic] = useState(false);
  const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingCharImages, setProcessingCharImages] = useState(false);
  const charFileRef = useRef<HTMLInputElement>(null);

  // 저장된 배경 이미지
  const [savedBackgrounds, setSavedBackgrounds] = useState<SavedBg[]>([]);
  const [selectedBgImageId, setSelectedBgImageId] = useState<string | null>(null);

  // 관리자: 유저 선택
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  // 상단 '더보기' 드롭다운: 바깥 클릭·Esc로 닫는다.
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

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
          // 디폴트 선택 (함수형 업데이트로 stale closure 방지)
          setSelectedPresets((prev) => {
            if (prev.length > 0) return prev;
            const allPresets = [...ungrouped, ...groups.flatMap((g: CharacterGroupData) => g.presets)];
            const wony = allPresets.find((p: Preset) => p.alias === "wony");
            return wony ? [wony] : allPresets.length > 0 ? [allPresets[0]] : prev;
          });
        } else if (Array.isArray(data)) {
          // 하위호환: 이전 flat 응답
          const mapped = data.map((p: Preset & { representativeImage?: PresetImageData | null }) => ({
            ...p,
            representativeImage: p.representativeImage ?? p.images[0] ?? null,
          }));
          setUngroupedPresets(mapped);
          setCharGroups([]);
          setSelectedPresets((prev) => {
            if (prev.length > 0) return prev;
            const wony = mapped.find((p: Preset) => p.alias === "wony");
            return [wony ?? mapped[0]];
          });
        }
      })
      .catch(() => { setCharGroups([]); setUngroupedPresets([]); })
      .finally(() => setPresetsLoading(false));
  }, [userParam]);

  // 저장된 배경 로드
  // 프롬프트 프리셋 로드
  const loadPromptPresets = useCallback(() => {
    fetch("/api/prompt-presets")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPromptPresets(data); })
      .catch(() => setPromptPresets([]));
  }, []);

  // 프롬프트 자동 저장 (생성 시)
  const savePromptPreset = useCallback((text: string) => {
    if (!text.trim()) return;
    fetch("/api/prompt-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    }).then(() => loadPromptPresets()).catch(() => {});
  }, [loadPromptPresets]);

  const loadSavedBackgrounds = useCallback(() => {
    const q = userParam ? `?${userParam}` : "";
    fetch(`/api/backgrounds${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSavedBackgrounds(data); })
      .catch(() => setSavedBackgrounds([]));
  }, [userParam]);

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
    const controller = new AbortController();
    setPresetsLoading(true);
    const query = userParam ? `?${userParam}` : "";
    void fetch(`/api/home/bootstrap${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "초기 데이터를 불러오지 못했습니다.");
        const groups: CharacterGroupData[] = data.presets?.groups ?? [];
        const ungrouped: Preset[] = data.presets?.ungrouped ?? [];
        setCharGroups(groups);
        setUngroupedPresets(ungrouped);
        setSelectedPresets((previous) => {
          if (previous.length > 0) return previous;
          const available = [...ungrouped, ...groups.flatMap((group) => group.presets)];
          const preferred = available.find((preset) => preset.isDefault)
            ?? available.find((preset) => preset.alias === "wony")
            ?? available[0];
          return preferred ? [preferred] : [];
        });
        setHistory(Array.isArray(data.history) ? data.history : []);
        setAllTags(Array.isArray(data.tags) ? data.tags : []);
        setPromptPresets(Array.isArray(data.promptPresets) ? data.promptPresets : []);
        setSavedBackgrounds(Array.isArray(data.backgrounds) ? data.backgrounds : []);
        setAllUsers(Array.isArray(data.users) ? data.users : []);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "초기 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPresetsLoading(false);
      });
    return () => controller.abort();
  }, [userParam]);

  // 히스토리를 플랫 이미지 배열로 변환 + 클라이언트 필터링
  const flatImages: FlatImage[] = useMemo(() => {
    const all = history.flatMap((item) =>
      item.images.map((img) => ({
        id: img.id,
        dataUrl: img.dataUrl,
        thumbnailUrl: img.thumbnailUrl,
        favorite: !!img.favorite,
        mode: item.mode,
        presetName: item.presetName,
        prompt: item.prompt,
        createdAt: item.createdAt,
        tags: img.tags ?? [],
      }))
    );
    let filtered = showFavoritesOnly ? all.filter((img) => img.favorite) : all;
    if (filterTagIds.length > 0) {
      filtered = filtered.filter((img) =>
        filterTagIds.some((tid) => img.tags.some((t) => t.id === tid))
      );
    }
    return filtered;
  }, [history, showFavoritesOnly, filterTagIds]);

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

  const handleManagePreset = async (preset: Preset) => {
    setManagingPreset(preset);
    try {
      const res = await fetch(`/api/presets/${preset.id}/images`);
      const data = await res.json();
      if (!res.ok) return;
      setManagingPreset({
        ...preset,
        images: data.images ?? preset.images,
        representativeImage: data.representativeImage ?? preset.representativeImage,
      });
    } catch {
      // Keep the lightweight preset open if detail loading fails.
    }
  };

  const handlePresetDeleted = useCallback((presetId: string) => {
    setSelectedPresets((current) => current.filter((item) => item.id !== presetId));
    setUngroupedPresets((current) => current.filter((item) => item.id !== presetId));
    setCharGroups((current) => current
      .map((group) => ({ ...group, presets: group.presets.filter((item) => item.id !== presetId) }))
      .filter((group) => group.presets.length > 0)
    );
    setManagingPreset(null);
    void loadPresets();
  }, [loadPresets]);

  const deleteOwnedPreset = async (preset: Preset) => {
    if (!window.confirm(`'${preset.name}' 캐릭터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const response = await fetch(`/api/presets/${preset.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "캐릭터를 삭제하지 못했습니다.");
      handlePresetDeleted(preset.id);
      setToast("캐릭터를 삭제했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "캐릭터를 삭제하지 못했습니다.");
    }
  };

  const ownedPresets = useMemo(() => {
    const byId = new Map<string, Preset>();
    for (const preset of [...ungroupedPresets, ...charGroups.flatMap((group) => group.presets)]) {
      if (preset.userId === user?.id) byId.set(preset.id, preset);
    }
    return Array.from(byId.values()).sort((left, right) =>
      Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)) ||
      (left.order || 0) - (right.order || 0)
    );
  }, [charGroups, ungroupedPresets, user?.id]);

  // 관리자: 유저 전환
  const handleUserSwitch = (userId: string) => {
    setViewingUserId(userId === user?.id ? null : userId);
    setSelectedPresets([]);
  };

  // 즐겨찾기 토글 (낙관적 업데이트)
  const handleToggleFavorite = (imageId: string) => {
    // 목표 상태를 명시적으로 계산해 서버에 전달한다(멱등). 더블클릭이나 HTTP 오류로
    // UI와 DB가 어긋나는 것을 막는다.
    const current = history.flatMap((h) => h.images).find((img) => img.id === imageId);
    const target = current ? !current.favorite : true;
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        images: item.images.map((img) =>
          img.id === imageId ? { ...img, favorite: target } : img
        ),
      }))
    );
    fetch(`/api/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: target }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("favorite failed");
      })
      .catch(() => {
        // 네트워크 오류뿐 아니라 HTTP 오류에도 원복한다.
        setHistory((prev) =>
          prev.map((item) => ({
            ...item,
            images: item.images.map((img) =>
              img.id === imageId ? { ...img, favorite: !target } : img
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
  const handleCharImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = 4 - uploadingImages.length;
    const toProcess = Array.from(files).slice(0, remaining);
    if (toProcess.length === 0) {
      e.target.value = "";
      return;
    }

    setProcessingCharImages(true);
    setError(null);
    try {
      const resized = await Promise.all(toProcess.map((file) => resizeFromFile(file)));
      setUploadingImages((prev) => [...prev, ...resized].slice(0, 4));
    } catch {
      setError("이미지를 처리하지 못했습니다. 다른 이미지 파일로 다시 시도해주세요.");
    } finally {
      setProcessingCharImages(false);
      e.target.value = "";
    }
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
          isPublic: newCharPublic,
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
      setNewCharPublic(false);
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

  // 태그 토글 (낙관적 업데이트)
  const handleToggleTag = async (imageId: string, tagId: string) => {
    const tag = allTags.find((t) => t.id === tagId);
    if (!tag) return;

    // 즉시 UI 업데이트
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        images: item.images.map((img) => {
          if (img.id !== imageId) return img;
          const hasTag = (img.tags ?? []).some((t) => t.id === tagId);
          return {
            ...img,
            tags: hasTag
              ? (img.tags ?? []).filter((t) => t.id !== tagId)
              : [...(img.tags ?? []), tag],
          };
        }),
      }))
    );

    // 서버 동기화 (백그라운드)
    fetch(`/api/images/${imageId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    }).catch(() => loadHistory()); // 실패 시 롤백
  };

  // 새 태그 생성 + 자동 태깅
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) {
        const newTag = await res.json();
        setAllTags((prev) => [...prev, newTag]);
        setNewTagName("");
        // 태그 메뉴가 열린 이미지에 자동 태깅
        if (tagMenuImageId) {
          handleToggleTagDirect(tagMenuImageId, newTag);
        }
      }
    } catch { /* ignore */ }
  };

  // 새로 만든 태그를 즉시 적용 (allTags에 아직 반영 안 됐을 수 있으므로 직접)
  const handleToggleTagDirect = (imageId: string, tag: TagData) => {
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        images: item.images.map((img) =>
          img.id === imageId ? { ...img, tags: [...(img.tags ?? []), tag] } : img
        ),
      }))
    );
    fetch(`/api/images/${imageId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    }).catch(() => loadHistory());
  };

  // 태그 삭제
  const handleDeleteTag = async (tagId: string) => {
    // 해당 태그가 달린 이미지 수 확인
    const count = flatImages.filter((img) => img.tags.some((t) => t.id === tagId)).length;
    if (count > 0) {
      const tag = allTags.find((t) => t.id === tagId);
      if (!window.confirm(`"${tag?.name}" 태그가 ${count}개 이미지에 사용 중입니다.\n해당 이미지들의 태그도 모두 사라집니다. 계속하시겠습니까?`)) return;
    }
    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (res.ok) {
        setAllTags((prev) => prev.filter((t) => t.id !== tagId));
        setFilterTagIds((prev) => prev.filter((id) => id !== tagId));
        loadHistory();
      }
    } catch { /* ignore */ }
  };

  // 이미지 공유 링크 복사
  const handleShare = async (dataUrl: string) => {
    try {
      await navigator.clipboard.writeText(dataUrl);
      setToast("링크가 복사되었습니다");
      setTimeout(() => setToast(null), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = dataUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setToast("링크가 복사되었습니다");
      setTimeout(() => setToast(null), 2000);
    }
  };

  const notifyGenerationDone = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);

    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("AutoCartoon", { body: message });
      return;
    }
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification("AutoCartoon", { body: message });
        }
      });
    }
  }, []);

  const handleGenerate = async () => {
    if (selectedPresets.length === 0) return;
    const hasImages = transformSlots.some((s) => s !== null);
    const hasPrompt = prompt.trim().length > 0;
    if (!hasImages && !hasPrompt) return;

    // 자동 모드: 이미지 있으면 transform, 텍스트만이면 text
    const autoMode = hasImages ? "transform" : "text";

    // 프롬프트 자동 저장
    if (hasPrompt) savePromptPreset(prompt);

    setGenerating(true);
    setGenElapsed(0);
    setGenerationStatus("요청을 준비하고 있습니다.");
    setError(null);

    // 경과 시간 타이머
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setGenElapsed(elapsed);
    }, 1000);

    // 120초 타임아웃
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

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
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      const jobId = data.job?.id as string | undefined;
      if (!jobId) {
        await loadHistory();
        notifyGenerationDone("이미지 생성이 완료되었습니다.");
        return;
      }

      clearTimeout(timeout);
      const stageMessages: Record<string, string> = {
        queued: "생성 대기열에 등록했습니다.",
        preparing_references: "캐릭터와 참조 이미지를 준비하고 있습니다.",
        generating_image: "AI가 장면을 그리고 있습니다.",
        storing: "생성한 이미지를 저장하고 있습니다.",
        completed: "이미지 생성이 완료되었습니다.",
      };
      // 일시적 폴링 실패(네트워크/5xx)를 즉시 실패로 단정하면 사용자가 재시도해
      // 같은 이미지에 대해 이중 과금이 발생한다. 연속 실패가 임계치를 넘을 때만 포기한다.
      const MAX_POLL_FAILURES = 5;
      let consecutiveFailures = 0;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        let statusData: { job?: { status: string; stage: string; progress: number; error?: string } };
        try {
          const statusResponse = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (!statusResponse.ok) throw new Error("poll failed");
          statusData = await statusResponse.json();
          consecutiveFailures = 0;
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_POLL_FAILURES) {
            // 서버 작업은 계속 진행될 수 있으므로 실패로 표시하지 않고 알림을 안내한다.
            await loadHistory();
            setError("생성 상태를 확인하지 못했습니다. 작업은 계속 진행되며 완료되면 알림으로 알려드립니다.");
            return;
          }
          continue;
        }
        const job = statusData.job;
        if (!job) continue;
        setGenerationStatus(
          `${stageMessages[job.stage] || "이미지를 처리하고 있습니다."} ${job.progress}%`
        );

        if (job.status === "succeeded") {
          await loadHistory();
          notifyGenerationDone("이미지 생성이 완료되어 갤러리에 반영했습니다.");
          return;
        }
        if (job.status === "failed" || job.status === "canceled") {
          throw new Error(job.error || "이미지 생성에 실패했습니다.");
        }
      }
      throw new Error("생성 작업이 오래 걸리고 있습니다. 작업은 서버에서 계속 진행됩니다.");
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      if (isTimeout) {
        setError("생성 대기 시간이 초과되었습니다 (120초). 서버에서 실패한 요청은 자동 환불됩니다. 잠시 후 갤러리를 확인해주세요.");
        // 서버에서 이미 생성됐을 수 있으므로 갤러리 새로고침
        setTimeout(() => {
          loadHistory();
          notifyGenerationDone("갤러리를 다시 확인했습니다.");
        }, 5000);
      } else {
        setError(err instanceof Error ? err.message : "오류 발생");
      }
    } finally {
      clearInterval(timer);
      clearTimeout(timeout);
      setGenerating(false);
      setGenElapsed(0);
      setGenerationStatus("");
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
            장면 생성
          </button>
          <button
            className={`${styles.tab} ${activeTab === "characterCreator" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("characterCreator")}
          >
            <LuPlus size={14} />
            캐릭터 만들기
          </button>
          <button
            className={`${styles.tab} ${activeTab === "designer" ? styles.tabActive : ""}`}
            onClick={handleDesignerTabClick}
            aria-busy={designerTabPending}
          >
            <LuUserRoundCog size={14} />
            캐릭터 설계
          </button>
          <button
            className={`${styles.tab} ${activeTab === "background" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("background")}
          >
            <LuImage size={14} />
            배경 생성
          </button>
          <button
            className={`${styles.tab} ${showCharacterLibrary ? styles.tabActive : ""}`}
            onClick={() => setShowCharacterLibrary(true)}
          >
            <LuUsers size={14} />
            내 캐릭터
          </button>
          <Link className={styles.tab} href="/studio">
            <LuClapperboard size={14} />
            통합 스튜디오
          </Link>
          <Link className={styles.tab} href="/shorts">
            <LuFilm size={14} />
            숏폼 제작
          </Link>
          {/* 보조 메뉴는 '더보기'로 접어 상단바 과밀을 막는다(기능은 그대로 유지). */}
          <div className={styles.moreWrap} ref={moreMenuRef}>
            <button
              type="button"
              className={`${styles.tab} ${
                ["board", "contents", "settings"].includes(activeTab) ? styles.tabActive : ""
              }`}
              onClick={() => setMoreMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
            >
              <LuChevronDown size={14} />
              더보기
            </button>
            {moreMenuOpen && (
              <div className={styles.moreMenu} role="menu">
                <Link
                  className={styles.moreItem}
                  href="/studio?mode=gesture"
                  role="menuitem"
                  onClick={() => setMoreMenuOpen(false)}
                >
                  <LuPersonStanding size={15} />
                  제스처 생성
                </Link>
                <Link
                  className={styles.moreItem}
                  href="/archive"
                  role="menuitem"
                  onClick={() => setMoreMenuOpen(false)}
                >
                  <LuImage size={15} />
                  작업 보관함
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.moreItem} ${activeTab === "board" ? styles.moreItemActive : ""}`}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setActiveTab("board");
                  }}
                >
                  <LuLayoutList size={15} />
                  게시판
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.moreItem} ${activeTab === "contents" ? styles.moreItemActive : ""}`}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setActiveTab("contents");
                  }}
                >
                  <LuLayoutList size={15} />
                  My Contents
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.moreItem} ${activeTab === "settings" ? styles.moreItemActive : ""}`}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setActiveTab("settings");
                  }}
                >
                  <LuSettings size={15} />
                  설정
                </button>
              </div>
            )}
          </div>
          {/* Instagram 탭: Meta App 설정 후 주석 해제 (INSTAGRAM_SETUP.md 참조) */}
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
          <GenerationNotifications />
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
        {activeTab === "characterCreator" ? (
          <CharacterCreator onPresetSaved={() => { loadPresets(); loadHistory(); }} />
        ) : activeTab === "designer" ? (
          <CharacterDesigner />
        ) : activeTab === "background" ? (
          <BackgroundGenerator />
        ) : activeTab === "board" ? (
          <Board />
        ) : activeTab === "instagram" ? (
          <InstagramTab />
        ) : activeTab === "contents" ? (
          <MyContents galleryImages={flatImages.map((img) => ({ id: img.id, dataUrl: img.dataUrl, thumbnailUrl: img.thumbnailUrl }))} />
        ) : activeTab === "settings" ? (
          <AccountSettings />
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
                          {thumb && <img src={thumb.thumbnailUrl ?? thumb.dataUrl} alt={group.name} />}
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
                            <img src={(p.representativeImage ?? p.images[0]).thumbnailUrl ?? (p.representativeImage ?? p.images[0]).dataUrl} alt={p.name} />
                          )}
                          {isSelected && isOwner && (
                            <button
                              className={styles.editBtn}
                              onClick={(e) => { e.stopPropagation(); handleManagePreset(p); }}
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
                      onManage={handleManagePreset}
                      currentUserId={user?.id}
                    />
                  ) : null
                )}
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
                      <img src={bg.thumbnailUrl ?? bg.dataUrl} alt={bg.name} />
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

          {/* 5) 프롬프트 입력 (캐릭터 태그 인라인) */}
          <section className={styles.section} style={{ position: "relative" }}>
            {promptPresets.length > 0 && (
              <button
                className={styles.promptPresetBtn}
                onClick={() => setShowPromptPresets(!showPromptPresets)}
                title="저장된 프롬프트"
              >
                ▾ 프롬프트 ({promptPresets.length})
              </button>
            )}
            {showPromptPresets && (
              <div className={styles.promptPresetDropdown}>
                {promptPresets.map((p) => (
                  <div key={p.id} className={styles.promptPresetItem}>
                    <button
                      className={styles.promptPresetText}
                      onClick={() => { setPrompt(p.text); setShowPromptPresets(false); }}
                    >
                      {p.text.length > 60 ? p.text.slice(0, 60) + "..." : p.text}
                    </button>
                    <button
                      className={styles.promptPresetDelete}
                      onClick={(e) => {
                        e.stopPropagation();
                        fetch("/api/prompt-presets", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: p.id }),
                        }).then(() => loadPromptPresets());
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <PromptInput
              tags={selectedPresets.map((p) => ({ id: p.id, name: p.name }))}
              text={prompt}
              onTextChange={setPrompt}
              onTagRemove={(id) => setSelectedPresets((prev) => prev.filter((p) => p.id !== id))}
              placeholder="이곳에 프롬프트를 입력하세요"
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
            <CreditCostBadge credits={AI_CREDIT_COSTS.image1k} />
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </aside>

        {/* 우측: 통합 갤러리 */}
        <div className={styles.content}>
          <div className={styles.galleryHeader}>
            <h2 className={styles.sectionTitle}>
              <LuSparkles size={14} /> My Gallery
            </h2>
            <div className={styles.galleryFilters}>
              <button
                className={`${styles.favFilterBtn} ${showFavoritesOnly ? styles.favFilterActive : ""}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                title={showFavoritesOnly ? "전체 보기" : "즐겨찾기만"}
              >
                <LuHeart size={14} />
              </button>
              {/* 태그 필터 칩들 */}
              {allTags.map((tag) => (
                <span
                  key={tag.id}
                  className={`${styles.tagFilterChip} ${filterTagIds.includes(tag.id) ? styles.tagFilterActive : ""}`}
                  style={{ "--tag-color": tag.color } as React.CSSProperties}
                >
                  <button
                    className={styles.tagFilterChipBody}
                    onClick={() => setFilterTagIds((prev) =>
                      prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    )}
                  >
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    {tag.name}
                  </button>
                  <button
                    className={styles.tagFilterDelete}
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                    title="태그 삭제"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.gallery}>
            {/* 생성 중 스켈레톤 */}
            {generating && (
              <div className={styles.galleryCard}>
                <div className={styles.skeletonPulse}>
                  <span className={styles.skeletonText}>
                    {generationStatus || `생성 중... ${genElapsed}초`}
                  </span>
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
                <img
                  src={img.thumbnailUrl ?? img.dataUrl}
                  alt="generated"
                  className={styles.galleryImg}
                  onClick={() => window.open(img.dataUrl, "_blank")}
                  style={{ cursor: "pointer" }}
                />
                <div className={styles.galleryActions}>
                  {/* 좌측: 태그 아이콘들 */}
                  <div className={styles.tagIcons}>
                    {img.tags.map((tag) => (
                      <LuTag key={tag.id} size={12} style={{ color: tag.color }} title={tag.name} />
                    ))}
                  </div>
                  {/* 우측: 기능 버튼들 */}
                  <div className={styles.actionBtns}>
                    <button
                      className={`${styles.galleryActionBtn} ${img.favorite ? styles.galleryFavorited : ""}`}
                      onClick={() => handleToggleFavorite(img.id)}
                      title="즐겨찾기"
                    >
                      <LuHeart size={14} />
                    </button>
                    <button
                      className={styles.galleryActionBtn}
                      onClick={() => setTagMenuImageId(tagMenuImageId === img.id ? null : img.id)}
                      title="태그"
                    >
                      <LuTag size={14} />
                    </button>
                    <button
                      className={styles.galleryActionBtn}
                      onClick={() => setEditingImage(img)}
                      title="편집"
                    >
                      <LuPencil size={14} />
                    </button>
                    <button
                      className={styles.galleryActionBtn}
                      onClick={() => handleShare(img.dataUrl)}
                      title="공유 링크 복사"
                    >
                      <LuShare2 size={14} />
                    </button>
                    <a
                      className={styles.galleryActionBtn}
                      href={img.dataUrl}
                      download={`image_${img.id}.png`}
                      onClick={(e) => e.stopPropagation()}
                      title="다운로드"
                    >
                      <LuDownload size={14} />
                    </a>
                    <button
                      className={`${styles.galleryActionBtn} ${styles.galleryDeleteBtn}`}
                      onClick={() => setDeletingImageId(img.id)}
                      title="삭제"
                    >
                      <LuTrash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* 태그 메뉴 */}
                {tagMenuImageId === img.id && (
                  <div className={styles.tagMenu}>
                    {allTags.map((tag) => {
                      const isActive = img.tags.some((t) => t.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          className={`${styles.tagMenuItem} ${isActive ? styles.tagMenuItemActive : ""}`}
                          onClick={() => handleToggleTag(img.id, tag.id)}
                        >
                          <span className={styles.tagDot} style={{ background: tag.color }} />
                          {tag.name}
                          {isActive && <span className={styles.tagCheck}>✓</span>}
                        </button>
                      );
                    })}
                    <div className={styles.tagMenuNew}>
                      <div className={styles.tagNewColorPicker}>
                        {TAG_COLORS.map((tc) => (
                          <button
                            key={tc.color}
                            className={`${styles.tagNewColorBtn} ${newTagColor === tc.color ? styles.tagNewColorActive : ""}`}
                            style={{ background: tc.color }}
                            onClick={() => { setNewTagColor(tc.color); if (!newTagName.trim()) setNewTagName(tc.name); }}
                          />
                        ))}
                      </div>
                      <div className={styles.tagNewRow}>
                        <input
                          className={styles.tagNewInput}
                          placeholder="새 태그"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); }}
                        />
                        <button className={styles.tagNewBtn} onClick={handleCreateTag}>+</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        </>
        )}
      </main>

      {/* 캔버스 편집 모드 */}
      {editingImage && (
        <CanvasEditor
          initialImage={{ id: editingImage.id, dataUrl: editingImage.dataUrl }}
          galleryImages={flatImages.map((img) => ({ id: img.id, dataUrl: img.dataUrl }))}
          onClose={() => setEditingImage(null)}
          onSave={() => { loadHistory(); }}
        />
      )}

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
      {showCharacterLibrary && (
        <div className={styles.modalOverlay} onClick={() => setShowCharacterLibrary(false)}>
          <section className={`${styles.modal} ${styles.characterLibraryModal}`} onClick={(event) => event.stopPropagation()} aria-labelledby="character-library-title">
            <div className={styles.characterLibraryHeader}>
              <div>
                <h2 id="character-library-title">내 캐릭터 관리</h2>
                <span>{ownedPresets.length}명</span>
              </div>
              <div>
                <button
                  className={styles.characterLibraryAdd}
                  onClick={() => { setShowCharacterLibrary(false); setShowUploadModal(true); }}
                >
                  <LuPlus /> 새 캐릭터 등록
                </button>
                <button className={styles.characterLibraryClose} onClick={() => setShowCharacterLibrary(false)} title="닫기"><LuX /></button>
              </div>
            </div>

            {presetsLoading ? (
              <div className={styles.characterLibraryEmpty}><span className={styles.spinner} /> 불러오는 중</div>
            ) : ownedPresets.length === 0 ? (
              <div className={styles.characterLibraryEmpty}>등록한 캐릭터가 없습니다.</div>
            ) : (
              <div className={styles.characterLibraryGrid}>
                {ownedPresets.map((preset) => (
                  <article className={styles.characterLibraryCard} key={preset.id}>
                    <div className={styles.characterLibraryViews}>
                      {["front", "left", "right", "back"].map((view, index) => {
                        const image = preset.images.find((item) => item.view === view) || preset.images[index];
                        return image
                          ? <img key={view} src={image.thumbnailUrl || image.dataUrl} alt={`${preset.name} ${view}`} />
                          : <span key={view}><LuImage /></span>;
                      })}
                    </div>
                    <div className={styles.characterLibraryInfo}>
                      <div>
                        <h3>{preset.name}</h3>
                        <span>{preset.isDefault ? "기본 캐릭터" : preset.voiceConfig?.[0]?.label || "음성 미설정"}</span>
                      </div>
                      <div className={styles.characterLibraryActions}>
                        <button type="button" title="캐릭터 편집" onClick={() => { setShowCharacterLibrary(false); void handleManagePreset(preset); }}><LuPencil /></button>
                        <button type="button" title="캐릭터 삭제" onClick={() => void deleteOwnedPreset(preset)}><LuTrash2 /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {managingPreset && (
        <CharacterManagementModal
          preset={managingPreset}
          onClose={() => setManagingPreset(null)}
          onDelete={handlePresetDeleted}
          onUpdate={(updated) => {
            const mergePreset = (current: Preset) =>
              current.id === updated.id
                ? { ...current, ...updated }
                : updated.isDefault
                  ? { ...current, isDefault: false }
                  : current;
            // 선택 목록 갱신
            setSelectedPresets((prev) =>
              prev.map(mergePreset)
            );
            // 그룹/독립 프리셋 목록 갱신
            setUngroupedPresets((prev) =>
              prev.map(mergePreset)
            );
            setCharGroups((prev) =>
              prev.map((g) => ({
                ...g,
                presets: g.presets.map(mergePreset),
              }))
            );
            setManagingPreset((current) => current?.id === updated.id ? { ...current, ...updated } : current);
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
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={newCharPublic}
                  onChange={(e) => setNewCharPublic(e.target.checked)}
                />
                <span>캐릭터 샵에 공개</span>
              </label>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                비공개 시 본인만 사용 가능합니다
              </span>
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
                    disabled={processingCharImages}
                  >
                    <LuPlus size={24} />
                    <span className={styles.uploadGridAddText}>추가</span>
                  </button>
                )}
              </div>

              <input
                ref={charFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
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
                  processingCharImages ||
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

      {showDesignerAccessDenied && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowDesignerAccessDenied(false)}
        >
          <div
            className={`${styles.modal} ${styles.accessModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="designer-access-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={styles.accessIcon} aria-hidden="true">
              <LuShieldAlert size={24} />
            </span>
            <h2 id="designer-access-title" className={styles.modalTitle}>
              접근 권한이 없습니다
            </h2>
            <p className={styles.accessDescription}>
              캐릭터 설계는 wony@wonyframe.com 계정과 관리자만 사용할 수 있습니다.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => setShowDesignerAccessDenied(false)}
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 챗봇 패널 */}
      {chatOpen && <ChatBot open onClose={() => setChatOpen(false)} />}

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
