"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuKeyRound, LuLogIn, LuUserPlus, LuX } from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "@/components/AuthProvider";
import LegalFooter from "@/components/LegalFooter";
import { addReturnTo, normalizeReturnTo } from "@/lib/auth-navigation";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password-policy";
import styles from "./page.module.css";

type EmailMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const [loginNotice, setLoginNotice] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

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
      not_configured: `${provider} 로그인이 아직 설정되지 않았습니다.`,
      invalid_state: "인증 요청이 만료되었거나 다른 브라우저에서 완료되었습니다. 같은 브라우저에서 다시 시도해주세요.",
      access_denied: `${provider} 로그인이 취소되었습니다.`,
      missing_code: `${provider} 인증 정보를 받지 못했습니다.`,
      failed: `${provider} 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.`,
      already_linked: `이 이메일은 다른 ${provider} 계정에 이미 연결되어 있습니다.`,
      link_login_required: `${provider} 계정을 연결하려면 먼저 로그인해주세요.`,
    };
    setError(messages[status] || messages.failed);
  }, []);

  useEffect(() => {
    if (!showForgot) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowForgot(false);
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
      setError(loginError instanceof Error ? loginError.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError("");
    setSignupMessage("");
    const passwordError = validatePassword(signupPassword);
    if (passwordError) {
      setSignupError(passwordError);
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSignupLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "회원가입에 실패했습니다.");
      setSignupMessage(data.message || "인증 메일을 보냈습니다.");
      setSignupPassword("");
      setSignupConfirm("");
    } catch (signupCause) {
      setSignupError(signupCause instanceof Error ? signupCause.message : "회원가입에 실패했습니다.");
    } finally {
      setSignupLoading(false);
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
      if (!response.ok) throw new Error(data.error || "재설정 메일 요청에 실패했습니다.");
      setForgotMessage(data.message || "등록된 계정이면 비밀번호 재설정 링크를 보냈습니다.");
    } catch (forgotPasswordError) {
      setForgotError(
        forgotPasswordError instanceof Error
          ? forgotPasswordError.message
          : "재설정 메일 요청에 실패했습니다."
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
        <h1 className={styles.logo}>워니바나나봇</h1>
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

        <div className={styles.divider}><span>또는 이메일로</span></div>

        <div className={styles.authTabs} role="tablist" aria-label="이메일 인증 방식">
          <button
            type="button"
            role="tab"
            aria-selected={emailMode === "login"}
            className={emailMode === "login" ? styles.authTabActive : styles.authTab}
            onClick={() => setEmailMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={emailMode === "signup"}
            className={emailMode === "signup" ? styles.authTabActive : styles.authTab}
            onClick={() => setEmailMode("signup")}
          >
            회원가입
          </button>
        </div>

        {emailMode === "login" ? (
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
                <button className={styles.forgotButton} type="button" onClick={openForgotPassword}>
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
              {loading ? "로그인 중..." : "이메일 로그인"}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleSignup}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-name">이름</label>
              <input
                id="signup-name"
                className={styles.input}
                value={signupName}
                onChange={(event) => setSignupName(event.target.value)}
                placeholder="표시 이름 (선택)"
                autoComplete="name"
                maxLength={80}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-email">이메일</label>
              <input
                id="signup-email"
                className={styles.input}
                type="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-password">비밀번호</label>
              <input
                id="signup-password"
                className={styles.input}
                type="password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder={`${MIN_PASSWORD_LENGTH}자 이상 · 특수문자 포함`}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <span className={styles.passwordHint}>8자 이상, 특수문자 1개 이상</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-confirm">비밀번호 확인</label>
              <input
                id="signup-confirm"
                className={styles.input}
                type="password"
                value={signupConfirm}
                onChange={(event) => setSignupConfirm(event.target.value)}
                placeholder="비밀번호 다시 입력"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
            {signupError && <p className={styles.error} role="alert">{signupError}</p>}
            {signupMessage && <p className={styles.success} role="status">{signupMessage}</p>}
            <button className={styles.loginBtn} type="submit" disabled={signupLoading}>
              <LuUserPlus size={17} aria-hidden="true" />
              {signupLoading ? "메일 보내는 중..." : "가입 인증 메일 받기"}
            </button>
          </form>
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
              aria-label="비밀번호 재설정 닫기"
              title="닫기"
            >
              <LuX size={18} />
            </button>
            <div className={styles.modalIcon} aria-hidden="true"><LuKeyRound size={22} /></div>
            <h2 id="forgot-password-title" className={styles.modalTitle}>비밀번호 재설정</h2>
            <p className={styles.modalDescription}>
              가입한 이메일로 30분 동안 한 번 사용할 수 있는 재설정 링크를 보냅니다.
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
                {forgotLoading ? "메일 보내는 중..." : "재설정 메일 보내기"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
