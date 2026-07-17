"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuKeyRound, LuX } from "react-icons/lu";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "@/components/AuthProvider";
import styles from "./page.module.css";

const MIN_PASSWORD_LENGTH = 10;

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("kakao");
    if (!status) return;
    const messages: Record<string, string> = {
      not_configured: "카카오 로그인이 아직 설정되지 않았습니다.",
      invalid_state: "인증을 시작한 브라우저와 완료한 브라우저가 달라졌거나 요청이 만료되었습니다. 같은 브라우저에서 다시 시도해주세요.",
      access_denied: "카카오 로그인이 취소되었습니다.",
      missing_code: "카카오 인증 정보를 받지 못했습니다.",
      failed: "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
      already_linked: "이 이메일은 다른 카카오 계정에 이미 연결되어 있습니다.",
      link_login_required: "카카오 계정을 연결하려면 이메일 계정으로 먼저 로그인해주세요.",
    };
    setError(messages[status] || messages.failed);
  }, []);

  const [showRegister, setShowRegister] = useState(false);
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regMessage, setRegMessage] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    if (!showRegister && !showForgot) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowRegister(false);
        setShowForgot(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showForgot, showRegister]);

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

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegError("");
    setRegMessage("");

    if (regPassword.length < MIN_PASSWORD_LENGTH) {
      setRegError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (!/[A-Za-z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setRegError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setRegLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });
      const data = (await response.json()) as {
        autoVerified?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "가입에 실패했습니다.");

      setRegMessage(
        data.autoVerified ? "가입 완료! 로그인해주세요." : "가입 완료! 이메일을 확인해주세요."
      );
      if (data.autoVerified) {
        setTimeout(() => {
          setShowRegister(false);
          setEmail(regEmail.trim().toLowerCase());
        }, 1500);
      }
    } catch (registerError) {
      setRegError(registerError instanceof Error ? registerError.message : "가입 실패");
    } finally {
      setRegLoading(false);
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
        data.message || "등록된 계정이면 새 임시 비밀번호를 보냈습니다."
      );
    } catch (forgotPasswordError) {
      setForgotError(
        forgotPasswordError instanceof Error
          ? forgotPasswordError.message
          : "임시 비밀번호 발급 요청에 실패했습니다."
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

        <a className={styles.kakaoBtn} href="/api/auth/kakao">
          <RiKakaoTalkFill size={18} aria-hidden="true" />
          카카오로 시작하기
        </a>

        <div className={styles.divider} />

        <button className={styles.registerBtn} onClick={() => setShowRegister(true)}>
          신규 가입
        </button>
      </div>

      {showRegister && (
        <div className={styles.modalOverlay} onClick={() => setShowRegister(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.modalClose}
              type="button"
              onClick={() => setShowRegister(false)}
              aria-label="회원가입 닫기"
              title="닫기"
            >
              <LuX size={18} />
            </button>
            <h2 id="register-title" className={styles.modalTitle}>신규 가입</h2>
            <form className={styles.form} onSubmit={handleRegister}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="register-email">이메일</label>
                <input
                  id="register-email"
                  className={styles.input}
                  type="email"
                  value={regEmail}
                  onChange={(event) => setRegEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="register-password">비밀번호</label>
                <input
                  id="register-password"
                  className={styles.input}
                  type="password"
                  value={regPassword}
                  onChange={(event) => setRegPassword(event.target.value)}
                  placeholder="영문+숫자 혼합 10자 이상"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="register-confirm">비밀번호 확인</label>
                <input
                  id="register-confirm"
                  className={styles.input}
                  type="password"
                  value={regConfirm}
                  onChange={(event) => setRegConfirm(event.target.value)}
                  placeholder="비밀번호 재입력"
                  autoComplete="new-password"
                  required
                />
              </div>
              <p className={styles.notice}>
                회원등급 관리에 사용할 실제 이메일 주소를 입력해주세요.
              </p>
              {regError && <p className={styles.error} role="alert">{regError}</p>}
              {regMessage && <p className={styles.success} role="status">{regMessage}</p>}
              <button className={styles.loginBtn} type="submit" disabled={regLoading}>
                {regLoading ? "가입 중..." : "가입하기"}
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowRegister(false)}
              >
                취소
              </button>
            </form>
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
