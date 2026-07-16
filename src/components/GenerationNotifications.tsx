"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuBell, LuCheck, LuImage, LuLoaderCircle, LuVideo, LuX } from "react-icons/lu";
import styles from "./GenerationNotifications.module.css";

interface GenerationNotification {
  id: string;
  kind: string;
  status: "succeeded" | "failed";
  error: string | null;
  completedAt: string;
  notifiedAt: string | null;
  projectId: string | null;
  cutId: string | null;
  project: { title: string } | null;
  cut: { title: string } | null;
  artifacts: Array<{ thumbnailUrl: string | null; blobUrl: string; kind: string }>;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "요청 처리에 실패했습니다.");
  return body as T;
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function GenerationNotifications() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<GenerationNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await readJson<{ notifications: GenerationNotification[]; unreadCount: number }>(
        await fetch("/api/notifications", { cache: "no-store" })
      );
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
      return data;
    } catch {
      // The rest of the app remains usable when notification polling is unavailable.
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotifications(), 2_500);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const data = await loadNotifications(true);
    if (data && data.unreadCount > 0) {
      setUnreadCount(0);
      setItems((current) => current.map((item) => ({ ...item, notifiedAt: item.notifiedAt || new Date().toISOString() })));
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => void toggle()}
        aria-label={`작업 알림${unreadCount ? `, 읽지 않음 ${unreadCount}개` : ""}`}
        aria-expanded={open}
        title="작업 알림"
      >
        <LuBell />
        {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <section className={styles.popover} aria-label="작업 알림 목록">
          <header>
            <div>
              <strong>작업 알림</strong>
              <span>최근 생성 완료와 실패 내역</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} title="닫기"><LuX /></button>
          </header>
          <div className={styles.list}>
            {loading ? (
              <div className={styles.empty}><LuLoaderCircle className={styles.spin} /> 불러오는 중</div>
            ) : items.length === 0 ? (
              <div className={styles.empty}>아직 완료된 생성 작업이 없습니다.</div>
            ) : items.map((item) => {
              const artifact = item.artifacts[0];
              const href = item.projectId
                ? `/studio?project=${encodeURIComponent(item.projectId)}${item.cutId ? `&cut=${encodeURIComponent(item.cutId)}` : ""}`
                : "/archive";
              return (
                <Link key={item.id} href={href} className={styles.item} onClick={() => setOpen(false)}>
                  <span className={styles.preview}>
                    {artifact ? <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="" /> : item.kind === "video" ? <LuVideo /> : <LuImage />}
                  </span>
                  <span className={styles.content}>
                    <strong>{item.project?.title || (item.kind === "video" ? "영상 생성" : "이미지 생성")}</strong>
                    <span>{item.cut?.title || (item.status === "succeeded" ? "생성이 완료되었습니다." : item.error || "생성에 실패했습니다.")}</span>
                    <small>{relativeTime(item.completedAt)}</small>
                  </span>
                  <span className={item.status === "succeeded" ? styles.success : styles.failure}>
                    {item.status === "succeeded" ? <LuCheck /> : <LuX />}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
