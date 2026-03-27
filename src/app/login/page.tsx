"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 회원가입 모달
  const [showRegister, setShowRegister] = useState(false);
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regMessage, setRegMessage] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    setRegMessage("");

    if (regPassword.length < 8) {
      setRegError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!/[a-zA-Z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setRegError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.autoVerified) {
        setRegMessage("가입 완료! 로그인해주세요.");
        setTimeout(() => {
          setShowRegister(false);
          setEmail(regEmail);
        }, 1500);
      } else {
        setRegMessage("가입 완료! 이메일을 확인해주세요.");
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "가입 실패");
    } finally {
      setRegLoading(false);
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
            <label className={styles.label}>이메일</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>비밀번호</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.loginBtn} type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className={styles.divider} />

        <button
          className={styles.registerBtn}
          onClick={() => setShowRegister(true)}
        >
          신규 가입
        </button>
      </div>

      {/* 회원가입 모달 */}
      {showRegister && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowRegister(false)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>신규 가입</h2>
            <form className={styles.form} onSubmit={handleRegister}>
              <div className={styles.field}>
                <label className={styles.label}>이메일</label>
                <input
                  className={styles.input}
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>비밀번호</label>
                <input
                  className={styles.input}
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="영문+숫자 혼합 8자 이상"
                  required
                  minLength={8}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>비밀번호 확인</label>
                <input
                  className={styles.input}
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                />
              </div>
              <p className={styles.notice}>추후 이메일 인증절차로 회원등급관리가 되니 실사용하시는 이메일 주소 입력 바랍니다.</p>
              {regError && <p className={styles.error}>{regError}</p>}
              {regMessage && <p className={styles.success}>{regMessage}</p>}
              <button
                className={styles.loginBtn}
                type="submit"
                disabled={regLoading}
              >
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
    </div>
  );
}
