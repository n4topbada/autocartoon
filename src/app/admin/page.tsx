"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBell,
  LuCoins,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuSave,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/announcements";
import styles from "./page.module.css";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  kakaoLinked: boolean;
  emailVerified: boolean;
  paidPayments: number;
  createdAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  published: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  _count: { reads: number };
}

interface AnnouncementForm {
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  published: boolean;
  expiresAt: string;
}

const EMPTY_ANNOUNCEMENT: AnnouncementForm = {
  title: "",
  content: "",
  category: "notice",
  pinned: false,
  published: false,
  expiresAt: "",
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "요청 처리에 실패했습니다.");
  return body;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [grantingUserId, setGrantingUserId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await readJson<UserRow[]>(await fetch("/api/admin/users", { cache: "no-store" })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "사용자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnnouncements = useCallback(async () => {
    setAnnouncementLoading(true);
    setAnnouncementError("");
    try {
      setAnnouncements(await readJson<AnnouncementRow[]>(await fetch("/api/admin/announcements", { cache: "no-store" })));
    } catch (loadError) {
      setAnnouncementError(loadError instanceof Error ? loadError.message : "공지 목록을 불러오지 못했습니다.");
    } finally {
      setAnnouncementLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadAnnouncements();
  }, [loadAnnouncements, loadUsers]);

  const resetAnnouncementForm = () => {
    setAnnouncementForm(EMPTY_ANNOUNCEMENT);
    setEditingAnnouncementId(null);
  };

  const handleAnnouncementSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAnnouncementSaving(true);
    setAnnouncementError("");
    try {
      await readJson(await fetch("/api/admin/announcements", {
        method: editingAnnouncementId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingAnnouncementId ? { id: editingAnnouncementId } : {}),
          ...announcementForm,
          expiresAt: announcementForm.expiresAt ? new Date(announcementForm.expiresAt).toISOString() : null,
        }),
      }));
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (saveError) {
      setAnnouncementError(saveError instanceof Error ? saveError.message : "공지를 저장하지 못했습니다.");
    } finally {
      setAnnouncementSaving(false);
    }
  };

  const editAnnouncement = (announcement: AnnouncementRow) => {
    setEditingAnnouncementId(announcement.id);
    setAnnouncementForm({
      title: announcement.title,
      content: announcement.content,
      category: announcement.category,
      pinned: announcement.pinned,
      published: announcement.published,
      expiresAt: toLocalDateTime(announcement.expiresAt),
    });
    document.getElementById("announcement-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const deleteAnnouncement = async (announcement: AnnouncementRow) => {
    if (!window.confirm(`'${announcement.title}' 공지를 삭제할까요?`)) return;
    setAnnouncementError("");
    try {
      await readJson(await fetch(`/api/admin/announcements?id=${encodeURIComponent(announcement.id)}`, { method: "DELETE" }));
      if (editingAnnouncementId === announcement.id) resetAnnouncementForm();
      await loadAnnouncements();
    } catch (deleteError) {
      setAnnouncementError(deleteError instanceof Error ? deleteError.message : "공지를 삭제하지 못했습니다.");
    }
  };

  const handleAddCredits = async (userId: string) => {
    const amount = Number(creditInputs[userId]);
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    setGrantingUserId(userId);
    setError("");
    try {
      await readJson(await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addCredits: amount }),
      }));
      setCreditInputs((previous) => ({ ...previous, [userId]: "" }));
      await loadUsers();
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "크레딧 지급에 실패했습니다.");
    } finally {
      setGrantingUserId(null);
    }
  };

  const refreshAll = () => {
    void loadUsers();
    void loadAnnouncements();
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.iconButton} aria-label="작업 화면으로 돌아가기" title="돌아가기">
            <LuArrowLeft size={19} />
          </Link>
          <div><h1 className={styles.title}>운영 관리</h1><p>공지, 사용자와 크레딧을 관리합니다.</p></div>
        </div>
        <button className={styles.iconButton} type="button" onClick={refreshAll} title="전체 새로고침">
          <LuRefreshCw size={17} />
        </button>
      </header>

      <section className={styles.announcementSection} aria-labelledby="announcement-heading">
        <div className={styles.sectionHeader}>
          <div><LuBell /><span><h2 id="announcement-heading">운영 공지</h2><p>게시된 공지는 홈과 알림 센터에 즉시 표시됩니다.</p></span></div>
          <strong>{announcements.filter((item) => item.published).length}개 게시 중</strong>
        </div>

        {announcementError && <div className={styles.error} role="alert">{announcementError}</div>}
        <div className={styles.announcementGrid}>
          <form id="announcement-editor" className={styles.announcementForm} onSubmit={handleAnnouncementSubmit}>
            <div className={styles.formTitle}>
              <strong>{editingAnnouncementId ? "공지 수정" : "새 공지"}</strong>
              {editingAnnouncementId && (
                <button type="button" className={styles.formClose} onClick={resetAnnouncementForm} title="수정 취소"><LuX /></button>
              )}
            </div>
            <label>분류
              <select value={announcementForm.category} onChange={(event) => setAnnouncementForm((current) => ({ ...current, category: event.target.value as AnnouncementCategory }))}>
                {Object.entries(ANNOUNCEMENT_CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>제목
              <input maxLength={120} required value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>내용
              <textarea maxLength={5000} required rows={7} value={announcementForm.content} onChange={(event) => setAnnouncementForm((current) => ({ ...current, content: event.target.value }))} />
            </label>
            <label>만료 시각 <small>비워두면 계속 표시</small>
              <input type="datetime-local" value={announcementForm.expiresAt} onChange={(event) => setAnnouncementForm((current) => ({ ...current, expiresAt: event.target.value }))} />
            </label>
            <div className={styles.checks}>
              <label><input type="checkbox" checked={announcementForm.pinned} onChange={(event) => setAnnouncementForm((current) => ({ ...current, pinned: event.target.checked }))} /> 상단 고정</label>
              <label><input type="checkbox" checked={announcementForm.published} onChange={(event) => setAnnouncementForm((current) => ({ ...current, published: event.target.checked }))} /> 즉시 게시</label>
            </div>
            <button className={styles.saveButton} type="submit" disabled={announcementSaving}>
              {announcementSaving ? <LuLoaderCircle className={styles.spin} /> : editingAnnouncementId ? <LuSave /> : <LuPlus />}
              {editingAnnouncementId ? "수정 저장" : "공지 만들기"}
            </button>
          </form>

          <div className={styles.announcementList} aria-live="polite">
            {announcementLoading ? (
              <div className={styles.noticeState}><LuLoaderCircle className={styles.spin} /> 공지를 불러오는 중</div>
            ) : announcements.length === 0 ? (
              <div className={styles.noticeState}>등록된 공지가 없습니다.</div>
            ) : announcements.map((announcement) => (
              <article className={styles.announcementRow} key={announcement.id}>
                <div className={styles.announcementMeta}>
                  <span className={styles.categoryBadge}>{ANNOUNCEMENT_CATEGORY_LABELS[announcement.category] || "공지"}</span>
                  <span className={announcement.published ? styles.liveBadge : styles.draftBadge}>{announcement.published ? "게시" : "초안"}</span>
                  {announcement.pinned && <span>고정</span>}
                  <time>{new Date(announcement.updatedAt).toLocaleDateString("ko-KR")}</time>
                </div>
                <h3>{announcement.title}</h3>
                <p>{announcement.content}</p>
                <div className={styles.announcementFooter}>
                  <span>읽음 {announcement._count.reads.toLocaleString()}명{announcement.expiresAt ? ` · ${new Date(announcement.expiresAt).toLocaleString("ko-KR")} 만료` : ""}</span>
                  <span>
                    <button type="button" onClick={() => editAnnouncement(announcement)} title="공지 수정" aria-label={`${announcement.title} 수정`}><LuPencil /></button>
                    <button type="button" onClick={() => void deleteAnnouncement(announcement)} title="공지 삭제" aria-label={`${announcement.title} 삭제`}><LuTrash2 /></button>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.userSection} aria-labelledby="user-heading">
        <div className={styles.sectionHeader}><div><LuCoins /><span><h2 id="user-heading">사용자 및 크레딧</h2><p>잔액과 결제 연결 상태를 관리합니다.</p></span></div></div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {loading ? (
          <div className={styles.loading}><LuLoaderCircle className={styles.spin} /> 사용자 목록을 불러오는 중</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>이메일</th><th>이름</th><th>권한</th><th>크레딧</th><th>카카오</th><th>결제</th><th>가입일</th><th>수동 지급</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className={styles.email}>{user.email}</td>
                    <td>{user.name || "-"}</td>
                    <td><span className={user.role === "admin" ? styles.adminBadge : styles.userBadge}>{user.role}</span></td>
                    <td className={styles.creditCell}>{user.credits.toLocaleString()}</td>
                    <td>{user.kakaoLinked ? "연결" : "-"}</td>
                    <td>{user.paidPayments.toLocaleString()}건</td>
                    <td className={styles.date}>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td>
                      <div className={styles.creditAction}>
                        <input className={styles.creditInput} type="number" min="1" max="1000000" aria-label={`${user.email} 크레딧 지급량`} placeholder="수량" value={creditInputs[user.id] || ""} onChange={(event) => setCreditInputs((previous) => ({ ...previous, [user.id]: event.target.value }))} />
                        <button className={styles.creditBtn} type="button" onClick={() => void handleAddCredits(user.id)} disabled={grantingUserId !== null || !creditInputs[user.id] || Number(creditInputs[user.id]) <= 0}>
                          {grantingUserId === user.id ? <LuLoaderCircle className={styles.spin} /> : <LuCoins />} 지급
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.policySection}>
        <h2>운영 정책</h2>
        <p>신규 가입 30크레딧, 외부 AI 호출 전 차감, 실패 작업 자동 환불이 기본입니다. 수동 지급도 크레딧 원장에 관리자 ID와 함께 기록됩니다.</p>
        <Link href="/credits" className={styles.walletLink}>사용자 지갑 화면 보기</Link>
      </section>
    </main>
  );
}
