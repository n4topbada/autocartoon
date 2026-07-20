"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBell,
  LuCoins,
  LuCopy,
  LuEye,
  LuEyeOff,
  LuKeyRound,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuSave,
  LuSearch,
  LuShieldAlert,
  LuTrash2,
  LuUserCheck,
  LuX,
} from "react-icons/lu";
import {
  ADMIN_TEMPORARY_PASSWORD_ALPHABET,
  ADMIN_TEMPORARY_PASSWORD_LENGTH,
  validateAdminTemporaryPassword,
} from "@/lib/admin-password-reset";
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/announcements";
import {
  CREDIT_PRODUCTS,
  WELCOME_CREDITS,
  getCreditProduct,
  getProductTotalCredits,
} from "@/lib/credit-products";
import CouponAdminPanel from "@/components/CouponAdminPanel";
import styles from "./page.module.css";

interface UserRow {
  id: string;
  email: string;
  accountKey: string;
  name: string | null;
  role: string;
  credits: number;
  kakaoLinked: boolean;
  googleLinked: boolean;
  emailVerified: boolean;
  passwordResetEligible: boolean;
  temporaryPasswordExpiresAt: string | null;
  isCurrentUser: boolean;
  paidPayments: number;
  createdAt: string;
}

interface CreditGrantResult {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  previousCredits: number;
  grantedCredits: number;
  grantMode: "preset" | "custom";
  creditProductCode: string | null;
}

interface PasswordResetResult {
  ok: boolean;
  email: string;
  expiresAt: string;
  revokedSessions: number;
  selfReset: boolean;
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

function generateTemporaryPassword() {
  let password = "";
  do {
    const randomValues = crypto.getRandomValues(
      new Uint32Array(ADMIN_TEMPORARY_PASSWORD_LENGTH)
    );
    password = Array.from(
      randomValues,
      (value) => ADMIN_TEMPORARY_PASSWORD_ALPHABET[
        value % ADMIN_TEMPORARY_PASSWORD_ALPHABET.length
      ]
    ).join("");
  } while (validateAdminTemporaryPassword(password));
  return password;
}

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
  const [userSearch, setUserSearch] = useState("");
  const [selectedCreditUserId, setSelectedCreditUserId] = useState<string | null>(null);
  const [creditGrantMode, setCreditGrantMode] = useState<"preset" | "custom">("preset");
  const [selectedProductCode, setSelectedProductCode] = useState<string>(CREDIT_PRODUCTS[0].code);
  const [customCreditAmount, setCustomCreditAmount] = useState("");
  const [grantingUserId, setGrantingUserId] = useState<string | null>(null);
  const [creditGrantResult, setCreditGrantResult] = useState<CreditGrantResult | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<UserRow | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [passwordExpiry, setPasswordExpiry] = useState("1440");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordResetting, setPasswordResetting] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState("");
  const [passwordResetResult, setPasswordResetResult] = useState<PasswordResetResult | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [couponRefreshKey, setCouponRefreshKey] = useState(0);

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase("ko-KR");
    if (!query) return users;

    return users
      .map((user) => {
        const searchableValues = [user.accountKey, user.email, user.name || ""]
          .map((value) => value.toLocaleLowerCase("ko-KR"));
        const exactMatch = searchableValues.some((value) => value === query);
        const partialMatch = searchableValues.some((value) => value.includes(query));
        return { user, exactMatch, partialMatch };
      })
      .filter((item) => item.partialMatch)
      .sort((left, right) => Number(right.exactMatch) - Number(left.exactMatch))
      .map((item) => item.user);
  }, [userSearch, users]);

  const selectedCreditUser = useMemo(
    () => users.find((user) => user.id === selectedCreditUserId) ?? null,
    [selectedCreditUserId, users]
  );
  const selectedProduct = getCreditProduct(selectedProductCode) ?? CREDIT_PRODUCTS[0];
  const selectedGrantAmount = creditGrantMode === "preset"
    ? getProductTotalCredits(selectedProduct)
    : Number(customCreditAmount);

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

  const handleAddCredits = async () => {
    if (!selectedCreditUser) return;
    if (!Number.isSafeInteger(selectedGrantAmount) || selectedGrantAmount <= 0 || selectedGrantAmount > 1_000_000) {
      setError("직접 지급 크레딧은 1에서 1,000,000 사이의 정수로 입력해주세요.");
      return;
    }

    const grantDescription = creditGrantMode === "preset"
      ? `${selectedProduct.amountKrw.toLocaleString("ko-KR")}원 ${selectedProduct.name} 상품 (${selectedGrantAmount.toLocaleString("ko-KR")}C)`
      : `직접 입력 ${selectedGrantAmount.toLocaleString("ko-KR")}C`;
    const confirmed = window.confirm(
      `${selectedCreditUser.name || "이름 없음"} (${selectedCreditUser.accountKey})에게\n${grantDescription}을 지급할까요?\n\n현재 ${selectedCreditUser.credits.toLocaleString("ko-KR")}C → 지급 후 ${(selectedCreditUser.credits + selectedGrantAmount).toLocaleString("ko-KR")}C`
    );
    if (!confirmed) return;

    setGrantingUserId(selectedCreditUser.id);
    setError("");
    setCreditGrantResult(null);
    try {
      const result = await readJson<CreditGrantResult>(await fetch(
        `/api/admin/users/${encodeURIComponent(selectedCreditUser.id)}`,
        {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creditGrantMode === "preset"
          ? { creditProductCode: selectedProduct.code }
          : { addCredits: selectedGrantAmount }),
        }
      ));
      setUsers((current) => current.map((user) => user.id === result.id
        ? { ...user, credits: result.credits }
        : user));
      setCreditGrantResult(result);
      if (creditGrantMode === "custom") setCustomCreditAmount("");
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "크레딧 지급에 실패했습니다.");
    } finally {
      setGrantingUserId(null);
    }
  };

  const openPasswordReset = (user: UserRow) => {
    if (!user.passwordResetEligible) return;
    setPasswordResetTarget(user);
    setTemporaryPassword(generateTemporaryPassword());
    setPasswordExpiry("1440");
    setPasswordVisible(false);
    setPasswordResetError("");
    setPasswordResetResult(null);
    setPasswordCopied(false);
  };

  const closePasswordReset = useCallback(() => {
    if (passwordResetting) return;
    setPasswordResetTarget(null);
    setTemporaryPassword("");
    setPasswordResetError("");
    setPasswordResetResult(null);
    setPasswordCopied(false);
  }, [passwordResetting]);

  // 비밀번호 재설정 모달이 열려 있는 동안 뒤 페이지 스크롤을 잠그고 Escape로 닫는다.
  useEffect(() => {
    if (!passwordResetTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !passwordResetting) closePasswordReset();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closePasswordReset, passwordResetTarget, passwordResetting]);

  const copyTemporaryPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setPasswordCopied(true);
    } catch {
      setPasswordResetError("클립보드에 복사하지 못했습니다. 비밀번호를 직접 선택해 복사해주세요.");
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordResetTarget) return;
    const validationError = validateAdminTemporaryPassword(temporaryPassword);
    if (validationError) {
      setPasswordResetError(validationError);
      return;
    }

    const confirmation = passwordResetTarget.isCurrentUser
      ? "내 계정의 기존 비밀번호를 무효화하고 현재 세션을 포함한 모든 로그인을 종료할까요? 임시 비밀번호를 먼저 안전하게 보관해주세요."
      : `${passwordResetTarget.email} 계정의 기존 비밀번호를 무효화하고 모든 로그인 세션을 종료할까요?`;
    if (!window.confirm(confirmation)) return;

    setPasswordResetting(true);
    setPasswordResetError("");
    setPasswordResetResult(null);
    try {
      const result = await readJson<PasswordResetResult>(await fetch(
        `/api/admin/users/${encodeURIComponent(passwordResetTarget.id)}/temporary-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            temporaryPassword,
            expiresInMinutes: Number(passwordExpiry),
          }),
        }
      ));
      setPasswordResetResult(result);
      setUsers((current) => current.map((user) => user.id === passwordResetTarget.id
        ? { ...user, temporaryPasswordExpiresAt: result.expiresAt }
        : user));
    } catch (resetError) {
      setPasswordResetError(resetError instanceof Error ? resetError.message : "임시 비밀번호를 설정하지 못했습니다.");
    } finally {
      setPasswordResetting(false);
    }
  };

  const refreshAll = () => {
    void loadUsers();
    void loadAnnouncements();
    setCouponRefreshKey((current) => current + 1);
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.iconButton} aria-label="작업 화면으로 돌아가기" title="돌아가기">
            <LuArrowLeft size={19} />
          </Link>
          <div><h1 className={styles.title}>운영 관리</h1><p>공지, 쿠폰, 사용자와 크레딧을 관리합니다.</p></div>
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

      <CouponAdminPanel refreshKey={couponRefreshKey} />

      <section className={styles.userSection} aria-labelledby="user-heading">
        <div className={styles.sectionHeader}>
          <div><LuCoins /><span><h2 id="user-heading">사용자 및 크레딧</h2><p>계정을 검색해 결제 상품 단위 또는 직접 입력으로 크레딧을 지급합니다.</p></span></div>
          <strong>{users.length.toLocaleString("ko-KR")}명</strong>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {loading ? (
          <div className={styles.loading}><LuLoaderCircle className={styles.spin} /> 사용자 목록을 불러오는 중</div>
        ) : (
          <>
            <div className={styles.userManagementTools}>
              <div className={styles.userSearchPanel}>
                <label htmlFor="admin-user-search"><LuSearch /> 사용자 검색</label>
                <div className={styles.userSearchInput}>
                  <LuSearch aria-hidden="true" />
                  <input
                    id="admin-user-search"
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="kakao-4995225948, 전체 이메일 또는 이름"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {userSearch && (
                    <button type="button" onClick={() => setUserSearch("")} title="검색어 지우기" aria-label="검색어 지우기"><LuX /></button>
                  )}
                </div>
                <p>{userSearch.trim()
                  ? `${visibleUsers.length.toLocaleString("ko-KR")}명 검색됨 · 정확한 계정 키가 먼저 표시됩니다.`
                  : `전체 ${users.length.toLocaleString("ko-KR")}명 · 계정 키, 이메일, 이름으로 검색할 수 있습니다.`}</p>
              </div>

              <div id="credit-grant-panel" className={styles.creditGrantPanel}>
                <div className={styles.creditGrantHeader}>
                  <span><LuUserCheck /> 지급 대상</span>
                  {selectedCreditUser && <button type="button" onClick={() => {
                    setSelectedCreditUserId(null);
                    setCreditGrantResult(null);
                  }}>선택 해제</button>}
                </div>

                {!selectedCreditUser ? (
                  <div className={styles.creditGrantEmpty}>아래 검색 결과에서 지급할 계정을 선택하세요.</div>
                ) : (
                  <>
                    <div className={styles.creditGrantTarget}>
                      <span>
                        <strong>{selectedCreditUser.name || "이름 없음"}</strong>
                        <code>{selectedCreditUser.accountKey}</code>
                        {selectedCreditUser.email !== selectedCreditUser.accountKey && <small>{selectedCreditUser.email}</small>}
                      </span>
                      <span><small>현재 잔액</small><strong>{selectedCreditUser.credits.toLocaleString("ko-KR")} C</strong></span>
                    </div>

                    <div className={styles.creditPresetList} role="group" aria-label="크레딧 지급 방식">
                      {CREDIT_PRODUCTS.map((product) => {
                        const totalCredits = getProductTotalCredits(product);
                        const active = creditGrantMode === "preset" && selectedProductCode === product.code;
                        return (
                          <button
                            key={product.code}
                            type="button"
                            className={active ? styles.creditPresetActive : styles.creditPreset}
                            aria-pressed={active}
                            onClick={() => {
                              setCreditGrantMode("preset");
                              setSelectedProductCode(product.code);
                              setCreditGrantResult(null);
                            }}
                          >
                            <strong>{product.amountKrw.toLocaleString("ko-KR")}원</strong>
                            <span>{totalCredits.toLocaleString("ko-KR")} C</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={creditGrantMode === "custom" ? styles.creditPresetActive : styles.creditPreset}
                        aria-pressed={creditGrantMode === "custom"}
                        onClick={() => {
                          setCreditGrantMode("custom");
                          setCreditGrantResult(null);
                        }}
                      >
                        <strong>직접 입력</strong>
                        <span>최대 1,000,000 C</span>
                      </button>
                    </div>

                    {creditGrantMode === "custom" && (
                      <label className={styles.customCreditField}>직접 지급할 크레딧
                        <input
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          inputMode="numeric"
                          value={customCreditAmount}
                          onChange={(event) => {
                            setCustomCreditAmount(event.target.value);
                            setCreditGrantResult(null);
                          }}
                          placeholder="예: 10000"
                        />
                      </label>
                    )}

                    <button
                      className={styles.creditGrantButton}
                      type="button"
                      onClick={() => void handleAddCredits()}
                      disabled={grantingUserId !== null || !Number.isSafeInteger(selectedGrantAmount) || selectedGrantAmount <= 0 || selectedGrantAmount > 1_000_000}
                    >
                      {grantingUserId === selectedCreditUser.id ? <LuLoaderCircle className={styles.spin} /> : <LuCoins />}
                      {selectedGrantAmount > 0 && Number.isSafeInteger(selectedGrantAmount)
                        ? `${selectedGrantAmount.toLocaleString("ko-KR")} C 지급`
                        : "지급량을 입력하세요"}
                    </button>

                    {creditGrantResult && (
                      <div className={styles.creditGrantSuccess} role="status">
                        <strong>{creditGrantResult.grantedCredits.toLocaleString("ko-KR")} C 지급 완료</strong>
                        <span>{creditGrantResult.previousCredits.toLocaleString("ko-KR")} C → {creditGrantResult.credits.toLocaleString("ko-KR")} C · 원장 기록 완료</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>계정</th><th>이름</th><th>권한</th><th>크레딧</th><th>로그인</th><th>결제</th><th>가입일</th><th>크레딧 지급</th><th>계정 복구</th></tr></thead>
                <tbody>
                  {visibleUsers.length === 0 ? (
                    <tr><td className={styles.emptyUserResult} colSpan={9}>일치하는 계정이 없습니다.</td></tr>
                  ) : visibleUsers.map((user) => (
                    <tr key={user.id} className={selectedCreditUserId === user.id ? styles.selectedUserRow : undefined}>
                      <td className={styles.accountCell}>
                        <strong>{user.accountKey}</strong>
                        {user.email !== user.accountKey && <small>{user.email}</small>}
                        {user.isCurrentUser && <small>현재 관리자 계정</small>}
                      </td>
                      <td>{user.name || "-"}</td>
                      <td><span className={user.role === "admin" ? styles.adminBadge : styles.userBadge}>{user.role}</span></td>
                      <td className={styles.creditCell}>{user.credits.toLocaleString()}</td>
                      <td>
                        <span className={styles.loginMethods}>
                          {!user.kakaoLinked && !user.googleLinked && <span>이메일</span>}
                          {user.kakaoLinked && <span>카카오</span>}
                          {user.googleLinked && <span>구글</span>}
                        </span>
                      </td>
                      <td>{user.paidPayments.toLocaleString()}건</td>
                      <td className={styles.date}>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                      <td>
                        <button
                          className={styles.creditSelectButton}
                          type="button"
                          disabled={grantingUserId !== null}
                          onClick={() => {
                            setSelectedCreditUserId(user.id);
                            setCreditGrantResult(null);
                            document.getElementById("credit-grant-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                          }}
                        >
                          <LuUserCheck /> {selectedCreditUserId === user.id ? "선택됨" : "지급 선택"}
                        </button>
                      </td>
                      <td>
                        <div className={styles.passwordResetAction}>
                          <button
                            className={styles.passwordResetButton}
                            type="button"
                            onClick={() => openPasswordReset(user)}
                            disabled={!user.passwordResetEligible}
                            title={user.passwordResetEligible ? `${user.email} 비밀번호 재설정` : "소셜 로그인 전용 계정"}
                          >
                            <LuKeyRound /> {user.passwordResetEligible ? "재설정" : "OAuth 전용"}
                          </button>
                          {user.temporaryPasswordExpiresAt && new Date(user.temporaryPasswordExpiresAt) > new Date() && (
                            <small>{new Date(user.temporaryPasswordExpiresAt).toLocaleString("ko-KR")}까지</small>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.policySection}>
        <h2>운영 정책</h2>
        <p>신규 가입 {WELCOME_CREDITS}크레딧, 외부 AI 호출 전 차감, 실패 작업 자동 환불이 기본입니다. 수동 지급도 크레딧 원장에 관리자 ID와 함께 기록됩니다.</p>
        <Link href="/credits" className={styles.walletLink}>사용자 지갑 화면 보기</Link>
      </section>

      {passwordResetTarget && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePasswordReset();
        }}>
          <section className={styles.passwordModal} role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
            <header className={styles.modalHeader}>
              <span><LuKeyRound /><strong id="password-reset-title">임시 비밀번호 설정</strong></span>
              <button type="button" onClick={closePasswordReset} disabled={passwordResetting} title="닫기" aria-label="닫기"><LuX /></button>
            </header>

            <form className={styles.passwordResetForm} onSubmit={handlePasswordReset}>
              <div className={styles.resetTarget}>
                <span>대상 계정</span>
                <strong>{passwordResetTarget.email}</strong>
                <small>{passwordResetTarget.name || "이름 없음"} · {passwordResetTarget.role === "admin" ? "관리자" : "사용자"}</small>
              </div>

              <label>임시 비밀번호
                <div className={styles.passwordInputRow}>
                  <input
                    autoFocus
                    type={passwordVisible ? "text" : "password"}
                    value={temporaryPassword}
                    minLength={ADMIN_TEMPORARY_PASSWORD_LENGTH}
                    maxLength={ADMIN_TEMPORARY_PASSWORD_LENGTH}
                    pattern="[A-Za-z0-9]{12}"
                    autoComplete="new-password"
                    spellCheck={false}
                    onChange={(event) => {
                      setTemporaryPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ""));
                      setPasswordResetResult(null);
                      setPasswordCopied(false);
                    }}
                    aria-describedby="temporary-password-help"
                  />
                  <button type="button" onClick={() => setPasswordVisible((current) => !current)} title={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"} aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}>
                    {passwordVisible ? <LuEyeOff /> : <LuEye />}
                  </button>
                </div>
              </label>
              <div className={styles.passwordTools}>
                <button type="button" onClick={() => {
                  setTemporaryPassword(generateTemporaryPassword());
                  setPasswordResetResult(null);
                  setPasswordCopied(false);
                }}><LuRefreshCw /> 자동 생성</button>
                <button type="button" onClick={() => void copyTemporaryPassword()} disabled={!temporaryPassword}><LuCopy /> {passwordCopied ? "복사됨" : "복사"}</button>
              </div>
              <small id="temporary-password-help" className={styles.fieldHelp}>영문과 숫자를 모두 포함한 12자입니다.</small>

              <label>유효시간
                <select value={passwordExpiry} onChange={(event) => setPasswordExpiry(event.target.value)}>
                  <option value="30">30분</option>
                  <option value="120">2시간</option>
                  <option value="1440">24시간</option>
                </select>
              </label>

              <div className={styles.resetWarning}>
                <LuShieldAlert />
                <p>적용 즉시 기존 이메일 비밀번호가 무효화되고 모든 기기에서 로그아웃됩니다. 사용자는 이 임시 비밀번호로 로그인한 뒤 새 비밀번호를 설정해야 합니다.</p>
              </div>

              {passwordResetError && <div className={styles.modalError} role="alert">{passwordResetError}</div>}
              {passwordResetResult && (
                <div className={styles.resetSuccess} role="status">
                  발급 완료 · {new Date(passwordResetResult.expiresAt).toLocaleString("ko-KR")}까지 유효 · 세션 {passwordResetResult.revokedSessions}개 종료
                  {passwordResetResult.selfReset && <strong>현재 관리자 세션도 종료됐습니다. 비밀번호를 복사한 뒤 다시 로그인하세요.</strong>}
                </div>
              )}

              <footer className={styles.modalActions}>
                <button type="button" onClick={closePasswordReset} disabled={passwordResetting}>닫기</button>
                <button type="submit" disabled={passwordResetting || Boolean(validateAdminTemporaryPassword(temporaryPassword))}>
                  {passwordResetting ? <LuLoaderCircle className={styles.spin} /> : <LuKeyRound />}
                  재설정 적용
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
