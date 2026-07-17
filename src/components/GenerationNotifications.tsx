"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuBell,
  LuCheck,
  LuImage,
  LuLoaderCircle,
  LuMegaphone,
  LuPin,
  LuRotateCw,
  LuVideo,
  LuWrench,
  LuX,
} from "react-icons/lu";
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/announcements";
import CreditCostBadge from "./CreditCostBadge";
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
  creditCost: number;
  artifacts: Array<{ thumbnailUrl: string | null; blobUrl: string; kind: string }>;
}

interface AnnouncementNotification {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  readAt: string | null;
  isRead: boolean;
}

type NotificationTab = "jobs" | "announcements";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "요청 처리에 실패했습니다.");
  return body as T;
}

function relativeTime(value: string | null) {
  if (!value) return "";
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
  const [activeTab, setActiveTab] = useState<NotificationTab>("jobs");
  const [jobLoading, setJobLoading] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [jobItems, setJobItems] = useState<GenerationNotification[]>([]);
  const [announcementItems, setAnnouncementItems] = useState<AnnouncementNotification[]>([]);
  const [jobUnreadCount, setJobUnreadCount] = useState(0);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadJobs = useCallback(async (showLoading = false) => {
    if (showLoading) setJobLoading(true);
    try {
      const data = await readJson<{ notifications: GenerationNotification[]; unreadCount: number }>(
        await fetch("/api/notifications", { cache: "no-store" })
      );
      setJobItems(data.notifications);
      setJobUnreadCount(data.unreadCount);
      return data;
    } catch {
      return null;
    } finally {
      if (showLoading) setJobLoading(false);
    }
  }, []);

  const loadAnnouncements = useCallback(async (showLoading = false) => {
    if (showLoading) setAnnouncementLoading(true);
    try {
      const data = await readJson<{ announcements: AnnouncementNotification[]; unreadCount: number }>(
        await fetch("/api/announcements", { cache: "no-store" })
      );
      setAnnouncementItems(data.announcements);
      setAnnouncementUnreadCount(data.unreadCount);
      return data;
    } catch {
      return null;
    } finally {
      if (showLoading) setAnnouncementLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadAll = () => {
      void loadJobs();
      void loadAnnouncements();
    };
    const initial = window.setTimeout(loadAll, 2_500);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadAll();
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadAnnouncements, loadJobs]);

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

  useEffect(() => {
    const syncReadState = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const now = new Date().toISOString();
      setAnnouncementItems((current) => current.map((item) => item.id === id ? { ...item, isRead: true, readAt: item.readAt || now } : item));
      setAnnouncementUnreadCount((current) => Math.max(0, current - 1));
    };
    window.addEventListener("wony:announcement-read", syncReadState);
    return () => window.removeEventListener("wony:announcement-read", syncReadState);
  }, []);

  const markJobsRead = useCallback(() => {
    if (jobUnreadCount === 0) return;
    setJobUnreadCount(0);
    setJobItems((current) => current.map((item) => ({ ...item, notifiedAt: item.notifiedAt || new Date().toISOString() })));
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }, [jobUnreadCount]);

  const markAnnouncementsRead = useCallback(() => {
    if (announcementUnreadCount === 0) return;
    const now = new Date().toISOString();
    setAnnouncementUnreadCount(0);
    setAnnouncementItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || now })));
    void fetch("/api/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }, [announcementUnreadCount]);

  const selectTab = (tab: NotificationTab) => {
    setActiveTab(tab);
    if (tab === "jobs") markJobsRead();
    else markAnnouncementsRead();
  };

  const retry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      await readJson(await fetch(`/api/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      }));
      await loadJobs(true);
    } catch {
      // 다음 폴링에서 상태를 다시 확인한다.
    } finally {
      setRetrying(null);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;

    const [jobs, announcements] = await Promise.all([loadJobs(true), loadAnnouncements(true)]);
    const nextTab: NotificationTab = (announcements?.unreadCount || 0) > 0 ? "announcements" : "jobs";
    setActiveTab(nextTab);
    if (nextTab === "announcements" && (announcements?.unreadCount || 0) > 0) {
      const now = new Date().toISOString();
      setAnnouncementUnreadCount(0);
      setAnnouncementItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || now })));
      void fetch("/api/announcements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    } else if ((jobs?.unreadCount || 0) > 0) {
      setJobUnreadCount(0);
      setJobItems((current) => current.map((item) => ({ ...item, notifiedAt: item.notifiedAt || new Date().toISOString() })));
      void fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    }
  };

  const totalUnread = jobUnreadCount + announcementUnreadCount;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => void toggle()}
        aria-label={`알림${totalUnread ? `, 읽지 않음 ${totalUnread}개` : ""}`}
        aria-expanded={open}
        title="알림"
      >
        <LuBell />
        {totalUnread > 0 && <span>{totalUnread > 99 ? "99+" : totalUnread}</span>}
      </button>

      {open && (
        <section className={styles.popover} aria-label="알림 목록">
          <header>
            <div><strong>알림</strong><span>생성 작업과 운영 소식</span></div>
            <button type="button" onClick={() => setOpen(false)} title="닫기"><LuX /></button>
          </header>
          <div className={styles.tabs} role="tablist" aria-label="알림 종류">
            <button type="button" role="tab" aria-selected={activeTab === "jobs"} onClick={() => selectTab("jobs")}>작업 {jobUnreadCount > 0 && <span>{jobUnreadCount}</span>}</button>
            <button type="button" role="tab" aria-selected={activeTab === "announcements"} onClick={() => selectTab("announcements")}>공지 {announcementUnreadCount > 0 && <span>{announcementUnreadCount}</span>}</button>
          </div>

          {activeTab === "jobs" ? (
            <div className={styles.list} role="tabpanel">
              {jobLoading ? (
                <div className={styles.empty}><LuLoaderCircle className={styles.spin} /> 불러오는 중</div>
              ) : jobItems.length === 0 ? (
                <div className={styles.empty}>아직 완료된 생성 작업이 없습니다.</div>
              ) : jobItems.map((item) => {
                const artifact = item.artifacts[0];
                const href = item.projectId
                  ? `/studio?project=${encodeURIComponent(item.projectId)}${item.cutId ? `&cut=${encodeURIComponent(item.cutId)}` : ""}`
                  : "/archive";
                return (
                  <div key={item.id} className={styles.item}>
                    <Link href={href} className={styles.itemLink} onClick={() => setOpen(false)}>
                      <span className={styles.preview}>{artifact ? <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="" /> : item.kind === "video" ? <LuVideo /> : <LuImage />}</span>
                      <span className={styles.content}>
                        <strong>{item.project?.title || (item.kind === "video" ? "영상 생성" : "이미지 생성")}</strong>
                        <span>{item.cut?.title || (item.status === "succeeded" ? "생성이 완료되었습니다." : item.error || "생성에 실패했습니다.")}</span>
                        <small>{relativeTime(item.completedAt)}</small>
                      </span>
                    </Link>
                    {item.status === "failed" && (
                      <button type="button" className={styles.retry} title="다시 시도" aria-label="생성 다시 시도" onClick={() => void retry(item.id)} disabled={retrying === item.id}>
                        {retrying === item.id ? <LuLoaderCircle className={styles.spin} /> : <LuRotateCw />}
                        <CreditCostBadge credits={item.creditCost} />
                      </button>
                    )}
                    <span className={item.status === "succeeded" ? styles.success : styles.failure}>{item.status === "succeeded" ? <LuCheck /> : <LuX />}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.list} role="tabpanel">
              {announcementLoading ? (
                <div className={styles.empty}><LuLoaderCircle className={styles.spin} /> 불러오는 중</div>
              ) : announcementItems.length === 0 ? (
                <div className={styles.empty}>현재 게시된 공지가 없습니다.</div>
              ) : announcementItems.map((item) => (
                <article className={`${styles.announcement} ${item.isRead ? "" : styles.unread}`} key={item.id}>
                  <span className={styles.announcementIcon}>{item.category === "maintenance" ? <LuWrench /> : item.pinned ? <LuPin /> : <LuMegaphone />}</span>
                  <span className={styles.announcementContent}>
                    <span><small>{ANNOUNCEMENT_CATEGORY_LABELS[item.category] || "공지"}</small><time>{relativeTime(item.publishedAt)}</time></span>
                    <strong>{item.title}</strong>
                    <span>{item.content}</span>
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
