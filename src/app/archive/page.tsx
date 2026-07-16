"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  LuArrowLeft,
  LuChevronLeft,
  LuChevronRight,
  LuDownload,
  LuImage,
  LuLoaderCircle,
  LuSearch,
  LuTrash2,
  LuVideo,
  LuX,
  LuPencil,
} from "react-icons/lu";
import styles from "./page.module.css";

const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), { ssr: false });

interface ArchiveItem {
  key: string;
  kind: string;
  mediaType: "image" | "video";
  url: string;
  thumbnailUrl: string;
  mimeType: string;
  prompt: string;
  createdAt: string;
}

interface ArchiveResponse {
  items: ArchiveItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "image", label: "장면" },
  { id: "character", label: "캐릭터" },
  { id: "gesture", label: "제스처" },
  { id: "background", label: "배경" },
  { id: "cutout", label: "누끼" },
  { id: "video", label: "영상" },
];

const KIND_LABELS: Record<string, string> = {
  image: "장면",
  character: "캐릭터",
  gesture: "제스처",
  background: "배경",
  cutout: "누끼",
  video: "영상",
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function ArchivePage() {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArchiveItem | null>(null);
  const [editing, setEditing] = useState<ArchiveItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kind, page: String(page) });
      if (search) params.set("q", search);
      setData(await readJson<ArchiveResponse>(await fetch(`/api/archive?${params}`, { cache: "no-store" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "작업 보관함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [kind, page, search]);

  useEffect(() => { void load(); }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(query.trim());
  };

  const download = async (item: ArchiveItem) => {
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("파일을 내려받지 못했습니다.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${item.kind}-${item.key.split(":")[1]}.${item.mediaType === "video" ? "mp4" : "png"}`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다운로드하지 못했습니다.");
    }
  };

  const remove = async (item: ArchiveItem) => {
    if (!window.confirm("이 작업 결과를 보관함에서 삭제할까요?")) return;
    setDeleting(item.key);
    setError(null);
    try {
      await readJson(await fetch(`/api/archive/${encodeURIComponent(item.key)}`, { method: "DELETE" }));
      setPreview((current) => current?.key === item.key ? null : current);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "삭제하지 못했습니다.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.iconButton} title="돌아가기"><LuArrowLeft /></Link>
        <div>
          <h1>작업 보관함</h1>
          <span>{data?.pagination.total ?? 0}개</span>
        </div>
        <form className={styles.search} onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
          <LuSearch />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프롬프트 검색" />
          {query && <button type="button" title="검색어 지우기" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}><LuX /></button>}
        </form>
      </header>

      <nav className={styles.filters} aria-label="보관함 필터">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={kind === filter.id ? styles.filterActive : ""}
            onClick={() => { setKind(filter.id); setPage(1); }}
          >{filter.label}</button>
        ))}
      </nav>

      {error && <div className={styles.error} role="alert">{error}<button onClick={() => setError(null)} title="닫기"><LuX /></button></div>}

      {loading ? (
        <div className={styles.empty}><LuLoaderCircle className={styles.spin} /></div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.empty}><LuImage /><strong>보관된 결과가 없습니다.</strong></div>
      ) : (
        <section className={styles.grid}>
          {data.items.map((item) => (
            <article className={styles.card} key={item.key}>
              <button className={styles.media} onClick={() => setPreview(item)}>
                {item.mediaType === "video"
                  ? <video src={item.url} muted preload="metadata" />
                  : <img src={item.thumbnailUrl} alt={item.prompt || KIND_LABELS[item.kind]} />}
              </button>
              <div className={styles.meta}>
                <span className={styles.kind}>{item.mediaType === "video" ? <LuVideo /> : <LuImage />}{KIND_LABELS[item.kind] || item.kind}</span>
                <time>{new Date(item.createdAt).toLocaleDateString("ko-KR")}</time>
              </div>
              <p>{item.prompt || "프롬프트 없음"}</p>
              <div className={styles.actions}>
                <button onClick={() => void download(item)} title="다운로드"><LuDownload /></button>
                <button onClick={() => void remove(item)} disabled={deleting === item.key} title="삭제">
                  {deleting === item.key ? <LuLoaderCircle className={styles.spin} /> : <LuTrash2 />}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {data && data.pagination.totalPages > 1 && (
        <footer className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} title="이전 페이지"><LuChevronLeft /></button>
          <span>{page} / {data.pagination.totalPages}</span>
          <button disabled={page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)} title="다음 페이지"><LuChevronRight /></button>
        </footer>
      )}

      {preview && (
        <div className={styles.previewOverlay} onClick={() => setPreview(null)}>
          <div className={styles.preview} onClick={(event) => event.stopPropagation()}>
            <button className={styles.previewClose} onClick={() => setPreview(null)} title="닫기"><LuX /></button>
            {preview.mediaType === "video"
              ? <video src={preview.url} controls autoPlay playsInline />
              : <img src={preview.url} alt={preview.prompt} />}
            {preview.mediaType === "image" && (
              <button
                className={styles.previewEdit}
                onClick={() => { setEditing(preview); setPreview(null); }}
              >
                <LuPencil /> 이 결과로 수정
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <CanvasEditor
          initialImage={{ id: editing.key, dataUrl: editing.url }}
          galleryImages={(data?.items || [])
            .filter((item) => item.mediaType === "image")
            .map((item) => ({ id: item.key, dataUrl: item.url }))}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); void load(); }}
        />
      )}
    </main>
  );
}
