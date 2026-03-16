"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import styles from "./UserAvatar.module.css";
import {
  LuCircleHelp,
  LuMail,
  LuSettings,
  LuLogOut,
} from "react-icons/lu";

export default function UserAvatar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const initial = (user.name || user.email)[0].toUpperCase();
  const tierRemaining =
    user.tierLimit === -1
      ? "무제한"
      : `${Math.max(0, user.tierLimit - user.tierUsed)}/${user.tierLimit}`;

  const tierLabel: Record<string, string> = {
    free: "Free",
    basic: "Basic",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  return (
    <div className={styles.container} ref={ref}>
      <button className={styles.avatar} onClick={() => setOpen(!open)}>
        {initial}
      </button>
      <span className={styles.userName}>{user.name || user.email.split("@")[0]}</span>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.info}>
            <div className={styles.email}>{user.email}</div>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <span className={styles.statLabel}>Tier</span>
            <span className={styles.statValue}>
              {tierLabel[user.tier] || user.tier} ({tierRemaining})
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>🍌 바나나</span>
            <span className={styles.statValue}>
              {user.credits.toLocaleString()}
            </span>
          </div>

          <div className={styles.divider} />

          <button
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              alert(
                "자주 묻는 질문\n\nQ: 바나나는 어떻게 충전하나요?\nA: 관리자에게 문의해주세요.\n\nQ: 이미지 생성 시 바나나가 차감되나요?\nA: 티어 무료 사용량을 먼저 소모한 후, 바나나가 차감됩니다.\n\nQ: 티어 무료 사용량은 언제 리셋되나요?\nA: 매월 1일에 자동 리셋됩니다."
              );
            }}
          >
            <LuCircleHelp size={14} /> FAQ
          </button>
          <a
            className={styles.menuItem}
            href="mailto:admin@wonyframe.com"
            onClick={() => setOpen(false)}
          >
            <LuMail size={14} /> 고객문의
          </a>

          {user.role === "admin" && (
            <>
              <div className={styles.divider} />
              <a className={styles.menuItem} href="/admin" onClick={() => setOpen(false)}>
                <LuSettings size={14} /> 관리자 페이지
              </a>
            </>
          )}

          <div className={styles.divider} />
          <button className={styles.logoutBtn} onClick={logout}>
            <LuLogOut size={14} /> 로그아웃
          </button>

          <div className={styles.divider} />
          <div className={styles.copyright}>
            <span>&copy; 2026 wonyframe.inc</span>
          </div>
        </div>
      )}
    </div>
  );
}
