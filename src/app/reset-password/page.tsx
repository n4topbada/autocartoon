"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LuCheck, LuEye, LuEyeOff, LuKeyRound } from "react-icons/lu";
import LegalFooter from "@/components/LegalFooter";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password-policy";
import styles from "./page.module.css";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const syncTokenFromUrl = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      setToken(params.get("token") || "");
      setError("");
      setSuccess(false);
      setReady(true);
    };
    syncTokenFromUrl();
    window.addEventListener("hashchange", syncTokenFromUrl);
    return () => window.removeEventListener("hashchange", syncTokenFromUrl);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "비밀번호를 재설정하지 못했습니다.");
      window.history.replaceState({}, "", window.location.pathname);
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 재설정하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          {success ? <LuCheck /> : <LuKeyRound />}
        </div>
        <h1>{success ? "재설정 완료" : "새 비밀번호 설정"}</h1>

        {!ready ? (
          <p className={styles.description}>링크를 확인하고 있습니다.</p>
        ) : success ? (
          <div className={styles.successPanel}>
            <p>새 비밀번호로 로그인할 수 있습니다.</p>
            <a href="/login">로그인으로 이동</a>
          </div>
        ) : !token ? (
          <div className={styles.errorPanel} role="alert">
            <p>유효한 재설정 링크가 아닙니다.</p>
            <a href="/login">로그인에서 다시 요청하기</a>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <p className={styles.description}>8자 이상, 특수문자를 1개 이상 포함해주세요.</p>
            <label htmlFor="reset-password">새 비밀번호</label>
            <div className={styles.passwordField}>
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                title={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPassword ? <LuEyeOff /> : <LuEye />}
              </button>
            </div>
            <label htmlFor="reset-password-confirm">새 비밀번호 확인</label>
            <input
              id="reset-password-confirm"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              required
            />
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "변경 중..." : "비밀번호 재설정"}
            </button>
          </form>
        )}
      </main>
      <LegalFooter />
    </div>
  );
}
