"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  LuArchive,
  LuArrowRight,
  LuCheck,
  LuChevronDown,
  LuCircle,
  LuClapperboard,
  LuCoins,
  LuFilm,
  LuImage,
  LuLoaderCircle,
  LuMegaphone,
  LuPaintbrush,
  LuPlus,
  LuRefreshCw,
  LuUsers,
} from "react-icons/lu";
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/announcements";
import styles from "./CreatorDashboard.module.css";

type DashboardTab = "character" | "characterCreator" | "background" | "contents";

interface DashboardData {
  user: { name: string | null; credits: number; tier: string; tierUsedThisMonth: number };
  counts: {
    characters: number;
    backgrounds: number;
    outputs: number;
    projects: number;
    posts: number;
  };
  onboarding: { character: boolean; scene: boolean; project: boolean };
  recentJobs: Array<{
    id: string;
    kind: string;
    status: string;
    stage: string;
    progress: number;
    prompt: string;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
    artifacts: Array<{ blobUrl: string; thumbnailUrl: string | null; mimeType: string }>;
  }>;
  recentProjects: Array<{
    id: string;
    title: string;
    aspectRatio: string;
    updatedAt: string;
    coverCut: { imageUrl: string | null; thumbnailUrl: string | null } | null;
    cuts: Array<{ imageUrl: string | null; thumbnailUrl: string | null }>;
    _count: { cuts: number; assets: number };
  }>;
}

interface DashboardAnnouncement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publishedAt: string | null;
  isRead: boolean;
}

const KIND_LABELS: Record<string, string> = {
  image: "장면",
  character: "캐릭터",
  gesture: "제스처",
  background: "배경",
  video: "영상",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "대기 중",
  running: "생성 중",
  succeeded: "완료",
  failed: "실패",
  canceled: "취소",
};

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function CreatorDashboard({ onNavigate }: { onNavigate: (tab: DashboardTab) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<DashboardAnnouncement[]>([]);
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(body.error || "제작 현황을 불러오지 못했습니다.");
      setData(body);
      setError(null);
      try {
        const announcementResponse = await fetch("/api/announcements?limit=3", { cache: "no-store" });
        const announcementBody = await announcementResponse.json() as { announcements?: DashboardAnnouncement[] };
        if (announcementResponse.ok) setAnnouncements(announcementBody.announcements || []);
      } catch {
        // 공지 조회 실패가 제작 현황을 막아서는 안 된다.
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "제작 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <div className={styles.state}><LuLoaderCircle className={styles.spin} /> 제작 현황 불러오는 중</div>;
  }

  if (!data) {
    return (
      <div className={styles.state}>
        <strong>{error || "제작 현황을 불러오지 못했습니다."}</strong>
        <button type="button" onClick={() => void load()}><LuRefreshCw /> 다시 불러오기</button>
      </div>
    );
  }

  const stats = [
    { label: "보유 크레딧", value: data.user.credits, icon: <LuCoins />, href: "/credits" },
    { label: "내 캐릭터", value: data.counts.characters, icon: <LuUsers />, action: () => onNavigate("contents") },
    { label: "생성물", value: data.counts.outputs, icon: <LuImage />, href: "/archive" },
    { label: "프로젝트", value: data.counts.projects, icon: <LuClapperboard />, href: "/studio" },
  ];
  const workflow = [
    { label: "캐릭터 준비", done: data.onboarding.character, action: () => onNavigate("characterCreator") },
    { label: "첫 장면 생성", done: data.onboarding.scene, action: () => onNavigate("character") },
    { label: "프로젝트 편집", done: data.onboarding.project, href: "/studio" },
  ];

  const toggleAnnouncement = (announcement: DashboardAnnouncement) => {
    const opening = expandedAnnouncementId !== announcement.id;
    setExpandedAnnouncementId(opening ? announcement.id : null);
    if (!opening || announcement.isRead) return;
    setAnnouncements((current) => current.map((item) => item.id === announcement.id ? { ...item, isRead: true } : item));
    window.dispatchEvent(new CustomEvent("wony:announcement-read", { detail: { id: announcement.id } }));
    void fetch("/api/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [announcement.id] }),
    });
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.topline}>
        <div>
          <span>Creator workspace</span>
          <h2>{data.user.name ? `${data.user.name}님의 제작 현황` : "제작 현황"}</h2>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading} title="새로고침">
          <LuRefreshCw className={loading ? styles.spin : ""} />
        </button>
      </header>

      {error && <div className={styles.warning} role="status">{error}</div>}

      {announcements.length > 0 && (
        <section className={styles.notices} aria-label="운영 공지">
          <div className={styles.noticeHeading}><LuMegaphone /><strong>공지</strong><span>새 소식과 운영 안내</span></div>
          <div className={styles.noticeList}>
            {announcements.map((announcement) => {
              const expanded = expandedAnnouncementId === announcement.id;
              return (
                <article className={`${styles.notice} ${announcement.isRead ? "" : styles.noticeUnread}`} key={announcement.id}>
                  <button type="button" onClick={() => toggleAnnouncement(announcement)} aria-expanded={expanded}>
                    <span>{ANNOUNCEMENT_CATEGORY_LABELS[announcement.category] || "공지"}</span>
                    <strong>{announcement.title}</strong>
                    <time>{announcement.publishedAt ? relativeTime(announcement.publishedAt) : ""}</time>
                    <LuChevronDown className={expanded ? styles.noticeChevronOpen : ""} />
                  </button>
                  {expanded && <p>{announcement.content}</p>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.stats} aria-label="제작 통계">
        {stats.map((item) => {
          const content = <><span className={styles.statIcon}>{item.icon}</span><span><small>{item.label}</small><strong>{item.value.toLocaleString()}</strong></span><LuArrowRight className={styles.statArrow} /></>;
          return item.href ? <Link href={item.href} key={item.label}>{content}</Link> : <button type="button" onClick={item.action} key={item.label}>{content}</button>;
        })}
      </section>

      <section className={styles.workflow} aria-label="제작 단계">
        <div className={styles.sectionHeading}>
          <div><span>제작 흐름</span><strong>{workflow.filter((item) => item.done).length}/3 완료</strong></div>
          <div className={styles.progress}><span style={{ width: `${workflow.filter((item) => item.done).length / 3 * 100}%` }} /></div>
        </div>
        <div className={styles.workflowSteps}>
          {workflow.map((item, index) => {
            const content = <><span className={item.done ? styles.done : styles.pending}>{item.done ? <LuCheck /> : <LuCircle />}</span><small>STEP {index + 1}</small><strong>{item.label}</strong><LuArrowRight /></>;
            return item.href ? <Link href={item.href} key={item.label}>{content}</Link> : <button type="button" onClick={item.action} key={item.label}>{content}</button>;
          })}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>최근 작업</span><strong>생성 대기열과 결과</strong></div><Link href="/archive">보관함 <LuArrowRight /></Link></div>
          <div className={styles.jobList}>
            {data.recentJobs.length === 0 ? <p className={styles.empty}>아직 생성 작업이 없습니다.</p> : data.recentJobs.map((job) => {
              const artifact = job.artifacts[0];
              return (
                <div className={styles.job} key={job.id}>
                  <span className={styles.jobPreview}>{artifact ? <img src={artifact.thumbnailUrl || artifact.blobUrl} alt="" /> : job.kind === "video" ? <LuFilm /> : <LuImage />}</span>
                  <span className={styles.jobText}><strong>{KIND_LABELS[job.kind] || "AI"} 생성</strong><small>{job.status === "failed" ? job.error || "실패" : job.prompt}</small></span>
                  <span className={`${styles.status} ${styles[`status_${job.status}`] || ""}`}>{STATUS_LABELS[job.status] || job.status}{job.status === "running" ? ` ${job.progress}%` : ""}</span>
                  <time>{relativeTime(job.completedAt || job.createdAt)}</time>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>최근 프로젝트</span><strong>이어서 편집</strong></div><Link href="/studio">전체 보기 <LuArrowRight /></Link></div>
          <div className={styles.projectList}>
            {data.recentProjects.length === 0 ? <p className={styles.empty}>아직 프로젝트가 없습니다.</p> : data.recentProjects.map((project) => {
              const preview = project.coverCut?.thumbnailUrl || project.coverCut?.imageUrl || project.cuts[0]?.thumbnailUrl || project.cuts[0]?.imageUrl;
              return (
                <Link href={`/studio?project=${encodeURIComponent(project.id)}`} className={styles.project} key={project.id}>
                  <span>{preview ? <img src={preview} alt="" /> : <LuClapperboard />}</span>
                  <span><strong>{project.title}</strong><small>{project._count.cuts}컷 · 자산 {project._count.assets}개 · {project.aspectRatio}</small></span>
                  <time>{relativeTime(project.updatedAt)}</time>
                  <LuArrowRight />
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className={styles.quick} aria-label="빠른 실행">
        <button type="button" onClick={() => onNavigate("characterCreator")}><LuPlus /><span><strong>캐릭터 만들기</strong><small>새 캐릭터 생성</small></span></button>
        <button type="button" onClick={() => onNavigate("character")}><LuPaintbrush /><span><strong>장면 생성</strong><small>캐릭터 장면 제작</small></span></button>
        <button type="button" onClick={() => onNavigate("background")}><LuImage /><span><strong>배경 생성</strong><small>저밀도 배경 제작</small></span></button>
        <Link href="/studio?mode=gesture"><LuUsers /><span><strong>제스처 생성</strong><small>1인·2인 포즈</small></span></Link>
        <Link href="/shorts"><LuFilm /><span><strong>숏폼 제작</strong><small>컷·음성 MP4 합성</small></span></Link>
        <Link href="/archive"><LuArchive /><span><strong>작업 보관함</strong><small>생성물 검색·관리</small></span></Link>
      </section>
    </div>
  );
}
