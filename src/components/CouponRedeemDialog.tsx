"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuCheck,
  LuClipboardPaste,
  LuCoins,
  LuLoaderCircle,
  LuTicket,
  LuX,
} from "react-icons/lu";
import { COUPON_CREDITS } from "@/lib/coupons";
import { useAuth } from "./AuthProvider";
import styles from "./CouponRedeemDialog.module.css";

type RedeemResult = {
  status: "redeemed" | "already_redeemed";
  credits: number;
  balance: number;
  redeemedAt: string;
  campaign: { id: string; code: string; title: string };
};

type CouponRedeemDialogProps = {
  open: boolean;
  onClose: () => void;
  initialCode?: string;
  onRedeemed?: (result: RedeemResult) => void | Promise<void>;
};

export default function CouponRedeemDialog({
  open,
  onClose,
  initialCode = "",
  onRedeemed,
}: CouponRedeemDialogProps) {
  const { refresh } = useAuth();
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(initialCode);
    setError("");
    setResult(null);
  }, [initialCode, open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open, submitting]);

  const pasteCode = async () => {
    setError("");
    try {
      setCode(await navigator.clipboard.readText());
    } catch {
      setError("클립보드를 읽지 못했습니다. 입력창을 선택한 뒤 직접 붙여넣어주세요.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json() as RedeemResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "쿠폰을 등록하지 못했습니다.");
      setResult(body);
      await refresh();
      await onRedeemed?.(body);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "쿠폰을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="coupon-dialog-title">
        <header className={styles.header}>
          <span><LuTicket /><strong id="coupon-dialog-title">쿠폰 등록</strong></span>
          <button type="button" onClick={onClose} disabled={submitting} title="닫기" aria-label="닫기"><LuX /></button>
        </header>

        {result ? (
          <div className={styles.successBody}>
            <span className={styles.successIcon}><LuCheck /></span>
            <div>
              <h2>{result.status === "redeemed" ? `${result.credits.toLocaleString()}C 지급 완료` : "이미 등록한 쿠폰입니다"}</h2>
              <p>{result.campaign.title}</p>
            </div>
            <div className={styles.balanceRow}>
              <span><LuCoins /> 현재 잔액</span>
              <strong>{result.balance.toLocaleString()}C</strong>
            </div>
            <div className={styles.successActions}>
              <button type="button" onClick={onClose}>닫기</button>
              <Link href="/" onClick={onClose}>제작하러 가기</Link>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.rewardLine}>
              <LuCoins /> 유효한 쿠폰 한 장당 <strong>{COUPON_CREDITS}C</strong>가 지급됩니다.
            </div>
            <label htmlFor="coupon-code">쿠폰 코드 또는 QR 링크</label>
            <div className={styles.inputRow}>
              <input
                id="coupon-code"
                autoFocus
                value={code}
                maxLength={2048}
                autoComplete="off"
                spellCheck={false}
                placeholder="WONY-XXXX-XXXX"
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="button" onClick={() => void pasteCode()} title="클립보드에서 붙여넣기" aria-label="클립보드에서 붙여넣기">
                <LuClipboardPaste />
              </button>
            </div>
            <p className={styles.help}>복사한 코드나 전체 쿠폰 주소를 그대로 붙여넣을 수 있습니다.</p>
            {error && <div className={styles.error} role="alert">{error}</div>}
            <button className={styles.submit} type="submit" disabled={submitting || !code.trim()}>
              {submitting ? <LuLoaderCircle className={styles.spin} /> : <LuTicket />}
              {COUPON_CREDITS}C 받기
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
