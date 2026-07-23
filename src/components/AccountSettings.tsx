"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  LuCircleAlert,
  LuCheck,
  LuLoaderCircle,
  LuRefreshCw,
  LuShieldCheck,
  LuUserRound,
  LuMonitorSmartphone,
  LuLogOut,
  LuTrash2,
} from "react-icons/lu";
import { useAuth } from "./AuthProvider";
import LegalFooter from "./LegalFooter";
import styles from "./AccountSettings.module.css";

interface DeviceSession {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

function AccountSettingsHeader() {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>Account</p>
        <h2 id="account-settings-title" className={styles.title}>
          계정 설정
        </h2>
      </div>
      <LuShieldCheck className={styles.headerIcon} aria-hidden="true" />
    </header>
  );
}

export default function AccountSettings() {
  const { user, loading, refresh } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [withdrawEmail, setWithdrawEmail] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionError("");
    try {
      const response = await fetch("/api/auth/sessions", { cache: "no-store" });
      const data = (await response.json()) as { sessions?: DeviceSession[]; error?: string };
      if (!response.ok) throw new Error(data.error || "기기 세션을 불러오지 못했습니다.");
      setDeviceSessions(data.sessions || []);
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "기기 세션을 불러오지 못했습니다.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadSessions();
  }, [loadSessions, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kakaoResult = params.get("kakao");
    const googleResult = params.get("google");
    if (kakaoResult === "linked") {
      setSuccess("카카오 계정을 연결했습니다. 이제 카카오 로그인으로 같은 계정을 사용할 수 있습니다.");
      void refresh();
    } else if (kakaoResult === "different_kakao") {
      setError("이 계정에는 다른 카카오 계정이 이미 연결되어 있습니다.");
    } else if (kakaoResult === "link_conflict") {
      setError("선택한 카카오 계정에 기존 생성물이나 활동 기록이 있어 자동으로 합칠 수 없습니다. 관리자에게 계정 병합을 요청해주세요.");
    } else if (googleResult === "linked") {
      setSuccess("Google 계정을 연결했습니다. 이제 Google 로그인으로 같은 계정을 사용할 수 있습니다.");
      void refresh();
    } else if (googleResult === "different_google") {
      setError("이 계정에는 다른 Google 계정이 이미 연결되어 있습니다.");
    } else if (googleResult === "link_conflict") {
      setError("선택한 Google 계정이 다른 사용자 계정에 연결되어 있습니다. 관리자에게 계정 병합을 요청해주세요.");
    }
    if (kakaoResult || googleResult) {
      const url = new URL(window.location.href);
      url.searchParams.delete("kakao");
      url.searchParams.delete("google");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [refresh]);

  const revokeSession = async (id?: string, others = false) => {
    setRevokingSession(others ? "others" : id || null);
    setSessionError("");
    try {
      const response = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(others ? { others: true } : { id }),
      });
      const data = (await response.json()) as { currentRevoked?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "기기 세션을 해제하지 못했습니다.");
      if (data.currentRevoked) {
        window.location.href = "/login";
        return;
      }
      await loadSessions();
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "기기 세션을 해제하지 못했습니다.");
    } finally {
      setRevokingSession(null);
    }
  };

  const canManageWithoutPassword = Boolean(user?.canManageAccountWithoutPassword);
  const passwordLoginAvailable = Boolean(user?.passwordLoginAvailable);

  const handleWithdrawal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWithdrawError("");
    if (withdrawEmail.trim().toLowerCase() !== user?.email.toLowerCase()) {
      setWithdrawError("확인용 이메일이 현재 계정과 일치하지 않습니다.");
      return;
    }

    setWithdrawing(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: withdrawPassword,
          emailConfirmation: withdrawEmail,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "계정 탈퇴에 실패했습니다.");
      window.location.replace("/login");
    } catch (cause) {
      setWithdrawError(cause instanceof Error ? cause.message : "계정 탈퇴에 실패했습니다.");
      setWithdrawing(false);
    }
  };

  if (!user) {
    return (
      <section className={styles.page} aria-labelledby="account-settings-title">
        <AccountSettingsHeader />
        <div
          className={styles.statePanel}
          role={loading ? "status" : "alert"}
          aria-live="polite"
        >
          {loading ? (
            <>
              <LuLoaderCircle className={styles.spinner} aria-hidden="true" />
              <div>
                <strong>계정 정보를 불러오는 중입니다.</strong>
                <span>잠시만 기다려주세요.</span>
              </div>
            </>
          ) : (
            <>
              <LuCircleAlert className={styles.stateIcon} aria-hidden="true" />
              <div>
                <strong>계정 정보를 불러오지 못했습니다.</strong>
                <span>로그인 상태를 다시 확인해주세요.</span>
              </div>
              <button type="button" onClick={() => void refresh()}>
                <LuRefreshCw size={16} aria-hidden="true" />
                다시 시도
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="account-settings-title">
      <AccountSettingsHeader />

      {error && <p className={styles.globalError} role="alert">{error}</p>}
      {success && (
        <p className={styles.globalSuccess} role="status">
          <LuCheck size={16} aria-hidden="true" /> {success}
        </p>
      )}

      <div className={styles.settingsGrid}>
        <section
          className={`${styles.panel} ${styles.accountPanelWide}`}
          aria-labelledby="account-info-title"
        >
          <div className={styles.panelHeading}>
            <LuUserRound size={18} aria-hidden="true" />
            <h3 id="account-info-title">계정 정보</h3>
          </div>
          <dl className={styles.accountList}>
            <div>
              <dt>이름</dt>
              <dd>{user.name || "미설정"}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>권한</dt>
              <dd>{user.role === "admin" ? "관리자" : "사용자"}</dd>
            </div>
            <div>
              <dt>크레딧</dt>
              <dd><a href="/credits">{user.credits.toLocaleString()} 크레딧</a></dd>
            </div>
            <div>
              <dt>카카오 로그인</dt>
              <dd>
                {user.kakaoLinked ? (
                  <span className={styles.connectionBadge}>연결됨</span>
                ) : (
                  <a className={styles.connectionButton} href="/api/auth/kakao?intent=link">카카오 연결</a>
                )}
              </dd>
            </div>
            <div>
              <dt>Google 로그인</dt>
              <dd>
                {user.googleLinked ? (
                  <span className={styles.connectionBadge}>연결됨</span>
                ) : (
                  <a
                    className={`${styles.connectionButton} ${styles.googleConnectionButton}`}
                    href="/api/auth/google?intent=link"
                  >
                    Google 연결
                  </a>
                )}
              </dd>
            </div>
          </dl>
          {passwordLoginAvailable && (
            <div className={styles.migrationNote}>
              <strong>기존 이메일 계정</strong>
              <span>
                소셜 계정을 연결하면 기존 비밀번호와 임시 비밀번호가 폐기되고 이후에는 카카오 또는 Google로 로그인합니다.
              </span>
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.sessionPanel}`} aria-labelledby="device-session-title">
          <div className={styles.sessionHeading}>
            <div className={styles.panelHeading}>
              <LuMonitorSmartphone size={18} aria-hidden="true" />
              <h3 id="device-session-title">로그인 기기</h3>
              <span>{sessionsLoading ? "…" : deviceSessions.length}/2</span>
            </div>
            <button
              type="button"
              className={styles.revokeOthers}
              onClick={() => void revokeSession(undefined, true)}
              disabled={deviceSessions.filter((item) => !item.current).length === 0 || revokingSession === "others"}
            >
              {revokingSession === "others" ? <LuLoaderCircle className={styles.spinner} /> : <LuLogOut />}
              다른 기기 로그아웃
            </button>
          </div>

          {sessionError && <p className={styles.error} role="alert">{sessionError}</p>}
          {sessionsLoading ? (
            <div className={styles.sessionLoading}><LuLoaderCircle className={styles.spinner} /></div>
          ) : (
            <div className={styles.sessionList}>
              {deviceSessions.map((item) => (
                <div className={styles.sessionItem} key={item.id}>
                  <LuMonitorSmartphone />
                  <div>
                    <strong>{item.device}{item.current && <span>현재 기기</span>}</strong>
                    <small>최근 활동 {new Date(item.lastSeenAt).toLocaleString("ko-KR")}</small>
                  </div>
                  <button
                    type="button"
                    title={item.current ? "현재 기기 로그아웃" : "기기 세션 해제"}
                    onClick={() => void revokeSession(item.id)}
                    disabled={Boolean(revokingSession)}
                  >
                    {revokingSession === item.id ? <LuLoaderCircle className={styles.spinner} /> : <LuLogOut />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.dangerPanel}`} aria-labelledby="withdrawal-title">
          <div className={styles.dangerHeading}>
            <div className={styles.panelHeading}>
              <LuTrash2 size={18} aria-hidden="true" />
              <h3 id="withdrawal-title">회원 탈퇴</h3>
            </div>
            {!showWithdrawal && (
              <button
                type="button"
                className={styles.withdrawOpenButton}
                onClick={() => setShowWithdrawal(true)}
              >
                <LuTrash2 size={15} aria-hidden="true" />
                계정 탈퇴
              </button>
            )}
          </div>

          <p className={styles.dangerDescription}>
            탈퇴하면 모든 기기에서 로그아웃되고 계정 정보는 익명화됩니다. 공개 중인 캐릭터는 비공개로 전환됩니다.
          </p>

          {showWithdrawal && (
            <form className={styles.withdrawForm} onSubmit={handleWithdrawal}>
              {!canManageWithoutPassword && (
                <div className={styles.field}>
                  <label htmlFor="withdraw-password">현재 비밀번호</label>
                  <input
                    id="withdraw-password"
                    type="password"
                    value={withdrawPassword}
                    onChange={(event) => setWithdrawPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              )}
              <div className={styles.field}>
                <label htmlFor="withdraw-email">확인을 위해 이메일을 다시 입력하세요</label>
                <input
                  id="withdraw-email"
                  type="email"
                  value={withdrawEmail}
                  onChange={(event) => setWithdrawEmail(event.target.value)}
                  placeholder={user.email}
                  autoComplete="email"
                  required
                />
              </div>
              {withdrawError && <p className={styles.error} role="alert">{withdrawError}</p>}
              <div className={styles.withdrawActions}>
                <button
                  type="button"
                  className={styles.withdrawCancelButton}
                  onClick={() => {
                    setShowWithdrawal(false);
                    setWithdrawPassword("");
                    setWithdrawEmail("");
                    setWithdrawError("");
                  }}
                  disabled={withdrawing}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className={styles.withdrawConfirmButton}
                  disabled={
                    withdrawing ||
                    (!canManageWithoutPassword && !withdrawPassword) ||
                    !withdrawEmail
                  }
                >
                  {withdrawing ? <LuLoaderCircle className={styles.spinner} /> : <LuTrash2 />}
                  {withdrawing ? "처리 중" : "계정 탈퇴"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
      <LegalFooter />
    </section>
  );
}
