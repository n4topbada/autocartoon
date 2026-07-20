"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuChevronDown, LuKeyRound, LuLogIn, LuX } from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "@/components/AuthProvider";
import LegalFooter from "@/components/LegalFooter";
import { addReturnTo, normalizeReturnTo } from "@/lib/auth-navigation";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLegacyLogin, setShowLegacyLogin] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const [loginNotice, setLoginNotice] = useState("");

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextReturnTo = normalizeReturnTo(params.get("returnTo"));
    const reason = params.get("reason");
    setReturnTo(nextReturnTo);
    if (reason === "session_expired") {
      setLoginNotice("세션이 만료되었습니다. 다시 로그인하면 이전 화면으로 돌아갑니다.");
    } else if (reason === "login_required") {
      setLoginNotice("이 화면을 이용하려면 로그인해주세요. 로그인 후 이전 화면으로 돌아갑니다.");
    }

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
      link_login_required: provider + " 계정을 연결하려면 기존 계정으로 먼저 로그인해주세요.",
    };
    setError(messages[status] || messages.failed);
  }, []);

  useEffect(() => {
    if (!showForgot) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowForgot(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showForgot]);

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
      router.replace(returnTo);
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
        data.message || "복구 대상인 기존 이메일 계정이면 새 임시 비밀번호를 보냈습니다.",
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

        {loginNotice && (
          <p className={styles.loginNotice} role="status">
            <LuLogIn size={17} aria-hidden="true" />
            <span>{loginNotice}</span>
          </p>
        )}

        <div className={styles.socialActions}>
          <a className={styles.kakaoBtn} href={addReturnTo("/api/auth/kakao", returnTo)}>
            <RiKakaoTalkFill size={18} aria-hidden="true" />
            카카오로 계속하기
          </a>
          <a className={styles.googleBtn} href={addReturnTo("/api/auth/google", returnTo)}>
            <FcGoogle size={18} aria-hidden="true" />
            Google로 계속하기
          </a>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button
          className={styles.legacyToggle}
          type="button"
          aria-expanded={showLegacyLogin}
          aria-controls="legacy-email-login"
          onClick={() => setShowLegacyLogin((visible) => !visible)}
        >
          기존 이메일 계정 로그인
          <LuChevronDown
            className={showLegacyLogin ? styles.chevronOpen : undefined}
            size={17}
            aria-hidden="true"
          />
        </button>

        {showLegacyLogin && (
          <div id="legacy-email-login" className={styles.legacyPanel}>
            <p className={styles.legacyDescription}>
              카카오·Google 도입 전에 만든 이메일 계정만 이용할 수 있습니다.
            </p>
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
                    비밀번호 찾기
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
              <button className={styles.loginBtn} type="submit" disabled={loading}>
                {loading ? "로그인 중..." : "이메일 로그인"}
              </button>
            </form>
          </div>
        )}
      </div>

      <LegalFooter />

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
              기존 이메일 계정 복구
            </h2>
            <p className={styles.modalDescription}>
              소셜 로그인 도입 전에 만든 계정에만 30분 동안 사용할 수 있는 영문·숫자 12자리 임시 비밀번호를 보냅니다.
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
