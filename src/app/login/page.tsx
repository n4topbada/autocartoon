"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuKeyRound, LuX } from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "@/components/AuthProvider";
import LegalFooter from "@/components/LegalFooter";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kakao = params.get("kakao");
    const google = params.get("google");
    if (!kakao && !google) return;

    const provider = google ? "Google" : "카카오";
    const status = google || kakao || "failed";
    const messages: Record<string, string> = {
      not_configured: provider + " 로그인이 아직 설정되지 않았습니다.",
      invalid_state:
        "인증을 시작한 브라우저와 완료한 브라우저가 다르거나 요청이 만료되었습니다. 같은 브라우저에서 다시 시도해주세요.",
      access_denied: provider + " 로그인이 취소되었습니다.",
      missing_code: provider + " 인증 정보를 받지 못했습니다.",
      failed: provider + " 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
      already_linked: "이 이메일은 다른 " + provider + " 계정에 이미 연결되어 있습니다.",
      link_login_required: "카카오 계정을 연결하려면 이메일 계정으로 먼저 로그인해주세요.",
      signup_limit: "이 네트워크에서는 새 계정을 최대 2개까지만 만들 수 있습니다.",
    };
    setError(messages[status] || messages.failed);
  }, []);

  useEffect(() => {
    if (!showSignup && !showForgot) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSignup(false);
        setShowForgot(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showForgot, showSignup]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "로그인에 실패했습니다.");
      await refresh();
      router.replace("/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email);
    setForgotError("");
    setForgotMessage("");
    setShowForgot(true);
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setForgotError("");
    setForgotMessage("");
    setForgotLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "임시 비밀번호 발급 요청에 실패했습니다.");
      }
      setForgotMessage(
        data.message || "등록된 계정이면 새 임시 비밀번호를 보냈습니다.",
      );
    } catch (forgotPasswordError) {
      setForgotError(
        forgotPasswordError instanceof Error
          ? forgotPasswordError.message
          : "임시 비밀번호 발급 요청에 실패했습니다.",
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoIcon}>
          <img src="/robot-wony.png" alt="워니봇" />
        </div>
        <h1 className={styles.logo}>🍌 워니바나나봇</h1>
        <p className={styles.subtitle}>웹툰 캐릭터 이미지 생성 서비스</p>

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </div>
          <div className={styles.field}>
            <div className={styles.passwordLabelRow}>
              <label className={styles.label} htmlFor="login-password">비밀번호</label>
              <button
                className={styles.forgotButton}
                type="button"
                onClick={openForgotPassword}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.loginBtn} type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className={styles.socialActions}>
          <a className={styles.kakaoBtn} href="/api/auth/kakao">
            <RiKakaoTalkFill size={18} aria-hidden="true" />
            카카오로 계속하기
          </a>
          <a className={styles.googleBtn} href="/api/auth/google">
            <FcGoogle size={18} aria-hidden="true" />
            Google로 계속하기
          </a>
        </div>

        <div className={styles.divider} />

        <button
          className={styles.registerBtn}
          type="button"
          onClick={() => setShowSignup(true)}
        >
          신규 가입
        </button>
      </div>

      <LegalFooter />

      {showSignup && (
        <div className={styles.modalOverlay} onClick={() => setShowSignup(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.modalClose}
              type="button"
              onClick={() => setShowSignup(false)}
              aria-label="회원가입 닫기"
              title="닫기"
            >
              <LuX size={18} />
            </button>
            <h2 id="signup-title" className={styles.modalTitle}>신규 가입</h2>
            <p className={styles.modalDescription}>
              카카오 또는 Google 계정으로 가입할 수 있습니다.
            </p>
            <div className={styles.socialActions}>
              <a className={styles.kakaoBtn} href="/api/auth/kakao">
                <RiKakaoTalkFill size={18} aria-hidden="true" />
                카카오로 가입하기
              </a>
              <a className={styles.googleBtn} href="/api/auth/google">
                <FcGoogle size={18} aria-hidden="true" />
                Google로 가입하기
              </a>
            </div>
            <p className={styles.notice}>
              같은 네트워크에서는 새 계정을 최대 2개까지 만들 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {showForgot && (
        <div className={styles.modalOverlay} onClick={() => setShowForgot(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.modalClose}
              type="button"
              onClick={() => setShowForgot(false)}
              aria-label="임시 비밀번호 발급 닫기"
              title="닫기"
            >
              <LuX size={18} />
            </button>
            <div className={styles.modalIcon} aria-hidden="true">
              <LuKeyRound size={22} />
            </div>
            <h2 id="forgot-password-title" className={styles.modalTitle}>
              임시 비밀번호 발급
            </h2>
            <p className={styles.modalDescription}>
              가입한 이메일로 30분 동안 사용할 수 있는 영문·숫자 12자리 비밀번호를 보냅니다.
            </p>
            <form className={styles.form} onSubmit={handleForgotPassword}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="forgot-email">이메일</label>
                <input
                  id="forgot-email"
                  className={styles.input}
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              {forgotError && <p className={styles.error} role="alert">{forgotError}</p>}
              {forgotMessage && <p className={styles.success} role="status">{forgotMessage}</p>}
              <button className={styles.loginBtn} type="submit" disabled={forgotLoading}>
                <LuKeyRound size={16} aria-hidden="true" />
                {forgotLoading ? "발급 중..." : "임시 비밀번호 받기"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
