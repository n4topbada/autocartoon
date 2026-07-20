"use client";

import { useEffect, useRef, useState } from "react";
import {
  LuCircleHelp,
  LuCoins,
  LuLogOut,
  LuMail,
  LuSettings,
  LuUserRoundCog,
  LuWalletCards,
} from "react-icons/lu";
import { useAuth } from "./AuthProvider";
import { WELCOME_CREDITS } from "@/lib/credit-products";
import styles from "./UserAvatar.module.css";

export default function UserAvatar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;
  const initial = (user.name || user.email)[0].toUpperCase();

  return (
    <div className={styles.container} ref={ref}>
      <button
        className={styles.avatar}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="사용자 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      <span className={styles.userName}>{user.name || user.email.split("@")[0]}</span>

      {open && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.info}><div className={styles.email}>{user.email}</div></div>
          <div className={styles.divider} />
          <button
            className={styles.menuItem}
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <LuUserRoundCog size={14} /> 계정 설정
          </button>
          <div className={styles.stat}>
            <span className={styles.statLabel}><LuCoins size={13} /> 크레딧</span>
            <span className={styles.statValue}>{user.credits.toLocaleString()}</span>
          </div>
          <a className={styles.menuItem} href="/credits" onClick={() => setOpen(false)}>
            <LuWalletCards size={14} /> 충전 및 사용 내역
          </a>

          <div className={styles.divider} />
          <button className={styles.menuItem} type="button" onClick={() => { setOpen(false); setShowFaq(true); }}>
            <LuCircleHelp size={14} /> FAQ
          </button>
          <a className={styles.menuItem} href="mailto:admin@wonyframe.com" onClick={() => setOpen(false)}>
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
          <button className={styles.logoutBtn} type="button" onClick={logout}>
            <LuLogOut size={14} /> 로그아웃
          </button>
          <div className={styles.divider} />
          <div className={styles.copyright}>&copy; 2026 wonyframe.inc</div>
        </div>
      )}

      {showFaq && (
        <div className={styles.faqOverlay} onClick={() => setShowFaq(false)}>
          <div className={styles.faqModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.faqTitle}><LuCircleHelp size={20} /> 자주 묻는 질문</h2>
            <div className={styles.faqContent}>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 크레딧은 어떻게 충전하나요?</p>
                <p className={styles.faqA}>A: 사용자 메뉴의 충전 및 사용 내역에서 카카오페이로 충전할 수 있습니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 어떤 작업에서 차감되나요?</p>
                <p className={styles.faqA}>A: AI 채팅, 이미지·영상 생성, OCR, 음성처럼 외부 AI 비용이 발생하는 작업에서 차감됩니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 생성이 실패하면 어떻게 되나요?</p>
                <p className={styles.faqA}>A: 서버가 실패로 확정한 작업은 차감된 크레딧을 자동 환불합니다.</p>
              </div>
              <div className={styles.faqItem}>
                <p className={styles.faqQ}>Q: 가입 혜택이 있나요?</p>
                <p className={styles.faqA}>A: 새 계정에는 첫 AI 작업을 시험할 수 있도록 {WELCOME_CREDITS}크레딧이 한 번 지급됩니다.</p>
              </div>
            </div>
            <button className={styles.faqClose} type="button" onClick={() => setShowFaq(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
