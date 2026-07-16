"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  LuCircleAlert,
  LuCheck,
  LuEye,
  LuEyeOff,
  LuKeyRound,
  LuLoaderCircle,
  LuRefreshCw,
  LuShieldCheck,
  LuUserRound,
  LuMonitorSmartphone,
  LuLogOut,
  LuTrash2,
} from "react-icons/lu";
import { useAuth } from "./AuthProvider";
import styles from "./AccountSettings.module.css";

const MIN_PASSWORD_LENGTH = 10;

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("새 비밀번호는 영문과 숫자를 모두 포함해야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "비밀번호 변경에 실패했습니다.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(data.message || "비밀번호가 변경되었습니다.");
      void refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "비밀번호 변경에 실패했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

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

      {user.mustChangePassword && (
        <div className={styles.temporaryNotice} role="status">
          <LuKeyRound size={18} aria-hidden="true" />
          <div>
            <strong>임시 비밀번호로 로그인했습니다.</strong>
            <span>30분이 지나기 전에 새 비밀번호로 변경해주세요.</span>
          </div>
        </div>
      )}

      <div className={styles.settingsGrid}>
        <section className={styles.panel} aria-labelledby="account-info-title">
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
              <dt>요금제</dt>
              <dd>{TIER_LABELS[user.tier] || user.tier}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="password-change-title">
          <div className={styles.panelHeading}>
            <LuKeyRound size={18} aria-hidden="true" />
            <h3 id="password-change-title">비밀번호 변경</h3>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="current-password">현재 비밀번호</label>
              <div className={styles.passwordInput}>
                <input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder={
                    user.mustChangePassword ? "이메일로 받은 임시 비밀번호" : "현재 비밀번호"
                  }
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((visible) => !visible)}
                  aria-label={showCurrentPassword ? "현재 비밀번호 숨기기" : "현재 비밀번호 보기"}
                  title={showCurrentPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showCurrentPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="new-password">새 비밀번호</label>
              <div className={styles.passwordInput}>
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="영문과 숫자를 포함한 10자 이상"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  aria-label={showNewPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                  title={showNewPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showNewPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password">새 비밀번호 확인</label>
              <div className={styles.passwordInput}>
                <input
                  id="confirm-password"
                  type={showNewPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="새 비밀번호 재입력"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}
            {success && (
              <p className={styles.success} role="status">
                <LuCheck size={16} aria-hidden="true" /> {success}
              </p>
            )}

            <button className={styles.submitButton} type="submit" disabled={submitting}>
              <LuShieldCheck size={17} aria-hidden="true" />
              {submitting ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
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
                  disabled={withdrawing || !withdrawPassword || !withdrawEmail}
                >
                  {withdrawing ? <LuLoaderCircle className={styles.spinner} /> : <LuTrash2 />}
                  {withdrawing ? "처리 중" : "계정 탈퇴"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
