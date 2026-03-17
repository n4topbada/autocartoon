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
  const [showFaq, setShowFaq] = useState(false);
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
              setShowFaq(true);
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
      {/* FAQ 모달 */}
      {showFaq && (
        <div className={styles.faqOverlay} onClick={() => setShowFaq(false)}>
          <div className={styles.faqModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.faqTitle}>
              <LuCircleHelp size={20} /> 자주 묻는 질문 (FAQ)
            </h2>
            <div className={styles.faqContent}>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 🍌 바나나는 어떻게 충전하나요?</p>
                <p className={styles.faqA}>A: 관리자에게 문의해주세요. 관리자가 바나나를 지급할 수 있습니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 이미지 생성 시 바나나가 차감되나요?</p>
                <p className={styles.faqA}>A: 각 티어별 월간 무료 사용량을 먼저 소모한 후, 추가 생성 시 바나나 1개가 차감됩니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 티어 무료 사용량은 언제 리셋되나요?</p>
                <p className={styles.faqA}>A: 매월 1일에 자동으로 리셋됩니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 캐릭터 프리셋은 어떻게 추가하나요?</p>
                <p className={styles.faqA}>A: 캐릭터 선택 영역에서 &quot;새 캐릭터&quot; 버튼을 눌러 이미지(최대 4장)를 업로드하면 됩니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 생성 모드 차이는 무엇인가요?</p>
                <p className={styles.faqA}>A: <strong>텍스트</strong> — 텍스트 설명만으로 생성, <strong>스케치</strong> — 스케치 이미지를 참조해 생성, <strong>편집</strong> — 기존 이미지를 수정합니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: Tier별 월간 무료 사용량은?</p>
                <p className={styles.faqA}>A: Free 5회, Basic 30회, Pro 100회, Enterprise 무제한</p>
              </div>
            </div>
            <button className={styles.faqClose} onClick={() => setShowFaq(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
