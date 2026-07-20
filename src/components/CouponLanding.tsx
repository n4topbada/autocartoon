"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill } from "react-icons/ri";
import {
  LuCheck,
  LuCircleAlert,
  LuCoins,
  LuLoaderCircle,
  LuTicketCheck,
} from "react-icons/lu";
import { useAuth } from "@/components/AuthProvider";
import LegalFooter from "@/components/LegalFooter";
import {
  COUPON_STATUS_MESSAGES,
  normalizeCouponCode,
  type CouponAvailability,
} from "@/lib/coupons";
import styles from "./CouponLanding.module.css";

type LookupResult = {
  campaign: {
    code: string;
    title: string;
    credits: number;
    startsAt: string | null;
    endsAt: string | null;
  };
  status: CouponAvailability;
};

type RedeemResult = {
  status: "redeemed" | "already_redeemed";
  credits: number;
  balance: number;
  campaign: { title: string; code: string };
};

export default function CouponLanding({ initialCode }: { initialCode: string }) {
  const { user, loading: authLoading, refresh } = useAuth();
  const code = useMemo(() => normalizeCouponCode(initialCode), [initialCode]);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    attempted.current = false;
    setLookup(null);
    setResult(null);
    setError("");
    setNeedsAuth(false);
    if (!code) {
      setError("쿠폰 주소가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/coupons/lookup/${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as LookupResult & { error?: string };
        if (!response.ok) throw new Error(body.error || "쿠폰 정보를 불러오지 못했습니다.");
        setLookup(body);
      })
      .catch((lookupError) => {
        if (lookupError instanceof DOMException && lookupError.name === "AbortError") return;
        setError(lookupError instanceof Error ? lookupError.message : "쿠폰 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    // Authenticated users always ask the idempotent grant endpoint. This lets a
    // previous recipient see "already redeemed" even after the campaign expires
    // or reaches its quota, while new recipients still receive the real error.
    if (authLoading || !user || !lookup || attempted.current) return;
    attempted.current = true;
    setRedeeming(true);
    fetch("/api/coupons/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        const body = await response.json() as RedeemResult & { error?: string; code?: string };
        if (!response.ok) {
          if (body.code === "auth_required") {
            setNeedsAuth(true);
            return;
          }
          throw new Error(body.error || "쿠폰을 지급하지 못했습니다.");
        }
        setResult(body);
        await refresh();
      })
      .catch((redeemError) => {
        setError(redeemError instanceof Error ? redeemError.message : "쿠폰을 지급하지 못했습니다.");
      })
      .finally(() => setRedeeming(false));
  }, [authLoading, code, lookup, refresh, user]);

  const returnTo = code ? `/coupon/${encodeURIComponent(code)}` : "/";
  const unavailable = lookup && lookup.status !== "available"
    ? COUPON_STATUS_MESSAGES[lookup.status]
    : "";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href={user ? "/" : "/login"} className={styles.brand}>
          <Image src="/robot-wony.png" alt="" width={36} height={36} priority />
          <strong>워니바나나봇</strong>
        </Link>
      </header>

      <div className={styles.stage}>
        <section className={styles.panel} aria-live="polite">
          <div className={styles.ticketMark}><LuTicketCheck /></div>
          {loading || authLoading ? (
            <div className={styles.state}><LuLoaderCircle className={styles.spin} /><strong>쿠폰을 확인하는 중</strong></div>
          ) : result ? (
            <>
              <span className={styles.successIcon}><LuCheck /></span>
              <div className={styles.heading}>
                <h1>{result.status === "redeemed" ? `${result.credits.toLocaleString()}C 지급 완료` : "이미 받은 혜택입니다"}</h1>
                <p>{result.campaign.title}</p>
              </div>
              <div className={styles.balance}><span><LuCoins /> 현재 잔액</span><strong>{result.balance.toLocaleString()}C</strong></div>
              <Link className={styles.primaryLink} href="/">제작 시작하기</Link>
            </>
          ) : redeeming ? (
            <div className={styles.state}><LuLoaderCircle className={styles.spin} /><strong>{lookup?.campaign.credits.toLocaleString()}C를 지급하는 중</strong></div>
          ) : error || unavailable ? (
            <>
              <span className={styles.errorIcon}><LuCircleAlert /></span>
              <div className={styles.heading}><h1>쿠폰을 사용할 수 없습니다</h1><p>{error || unavailable}</p></div>
              <Link className={styles.secondaryLink} href={user ? "/credits" : "/login"}>{user ? "크레딧 지갑으로" : "로그인으로"}</Link>
            </>
          ) : lookup && (!user || needsAuth) ? (
            <>
              <div className={styles.heading}>
                <span className={styles.campaignName}>{lookup.campaign.title}</span>
                <h1>{lookup.campaign.credits.toLocaleString()} 크레딧 받기</h1>
                <p>가입 또는 로그인하면 이 계정에 바로 지급됩니다.</p>
              </div>
              <div className={styles.loginActions}>
                <a className={styles.kakaoButton} href={`/api/auth/kakao?returnTo=${encodeURIComponent(returnTo)}`}><RiKakaoTalkFill /> 카카오로 계속하기</a>
                <a className={styles.googleButton} href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}><FcGoogle /> Google로 계속하기</a>
              </div>
              <small className={styles.note}>계정당 한 번만 받을 수 있습니다.</small>
            </>
          ) : null}
        </section>
      </div>
      <LegalFooter />
    </main>
  );
}
