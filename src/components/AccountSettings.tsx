"use client";

import { useState, type FormEvent } from "react";
import {
  LuCheck,
  LuEye,
  LuEyeOff,
  LuKeyRound,
  LuShieldCheck,
  LuUserRound,
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

export default function AccountSettings() {
  const { user, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      await refresh();
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

  if (!user) return null;

  return (
    <section className={styles.page} aria-labelledby="account-settings-title">
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Account</p>
          <h2 id="account-settings-title" className={styles.title}>
            계정 설정
          </h2>
        </div>
        <LuShieldCheck className={styles.headerIcon} aria-hidden="true" />
      </header>

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
      </div>
    </section>
  );
}
