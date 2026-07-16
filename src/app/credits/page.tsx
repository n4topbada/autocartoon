"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuArrowLeft,
  LuCheck,
  LuCoins,
  LuHistory,
  LuLoaderCircle,
  LuRefreshCw,
  LuShieldCheck,
} from "react-icons/lu";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "@/components/AuthProvider";
import styles from "./page.module.css";

type WalletData = {
  balance: number;
  welcomeCredits: number;
  welcomeGranted: boolean;
  products: Array<{
    code: string;
    name: string;
    credits: number;
    amountKrw: number;
    bonusCredits?: number;
  }>;
  costs: Array<{ label: string; credits: number }>;
  provider: { name: string; configured: boolean; testMode: boolean };
  ledger: Array<{
    id: string;
    action: string;
    source: string;
    units: number;
    balanceAfter: number | null;
    note: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    productCode: string;
    credits: number;
    amountKrw: number;
    status: string;
    approvedAt: string | null;
    createdAt: string;
  }>;
};

const PAYMENT_MESSAGES: Record<string, { text: string; tone: "success" | "error" | "info" }> = {
  success: { text: "결제가 완료되어 크레딧이 충전되었습니다.", tone: "success" },
  cancelled: { text: "결제를 취소했습니다.", tone: "info" },
  failed: { text: "결제가 완료되지 않았습니다. 잠시 후 다시 시도해주세요.", tone: "error" },
  processing: { text: "결제 승인을 처리하고 있습니다. 잠시 후 새로고침해주세요.", tone: "info" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ledgerLabel(action: string, source: string) {
  if (action === "purchase") return "카카오페이 충전";
  if (action === "grant") return "가입 크레딧";
  if (action === "refund") return "실패 자동 환불";
  const labels: Record<string, string> = {
    chat: "AI 채팅",
    "character-designer": "캐릭터 설계",
    "project-brief": "프로젝트 기획",
    "video-plan": "영상 플랜",
    ocr: "OCR",
    tts: "음성 생성",
    marketplace: "캐릭터 구매",
    admin: "관리자 지급",
    image: "이미지 생성",
    background: "배경 생성",
    "background-image": "배경 생성",
    character: "캐릭터 생성",
    gesture: "제스처 생성",
    video: "영상 생성",
  };
  return labels[source] || "AI 생성";
}

export default function CreditsPage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/credits", { cache: "no-store" });
      const result = (await response.json()) as WalletData & { error?: string };
      if (!response.ok) throw new Error(result.error || "크레딧 정보를 불러오지 못했습니다.");
      setData(result);
      await refresh();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "크레딧 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("payment");
    setPaymentStatus(status);
    void loadWallet();
  }, [loadWallet]);

  const startPayment = async (productCode: string) => {
    setPaying(productCode);
    setError("");
    try {
      const response = await fetch("/api/payments/kakao/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode }),
      });
      const result = (await response.json()) as {
        redirectUrl?: string;
        mobileRedirectUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "결제를 시작하지 못했습니다.");
      const isMobile = window.matchMedia("(max-width: 720px)").matches;
      const destination = isMobile ? result.mobileRedirectUrl : result.redirectUrl;
      if (!destination) throw new Error("카카오페이 결제 주소가 없습니다.");
      window.location.assign(destination);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "결제를 시작하지 못했습니다.");
      setPaying(null);
    }
  };

  if (authLoading || (loading && !data)) {
    return (
      <main className={styles.loadingPage}>
        <LuLoaderCircle className={styles.spin} size={24} />
        <span>크레딧 지갑을 불러오는 중</span>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.backButton} href="/" aria-label="작업 화면으로 돌아가기" title="돌아가기">
            <LuArrowLeft size={20} />
          </Link>
          <div>
            <h1>크레딧 지갑</h1>
            <p>AI 작업 비용과 충전 내역을 관리합니다.</p>
          </div>
          <button className={styles.refreshButton} type="button" onClick={() => void loadWallet()} title="새로고침">
            <LuRefreshCw size={17} />
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {paymentStatus && PAYMENT_MESSAGES[paymentStatus] && (
          <div className={`${styles.notice} ${styles[PAYMENT_MESSAGES[paymentStatus].tone]}`} role="status">
            {PAYMENT_MESSAGES[paymentStatus].tone === "success" && <LuCheck size={18} />}
            {PAYMENT_MESSAGES[paymentStatus].text}
          </div>
        )}
        {error && <div className={`${styles.notice} ${styles.error}`} role="alert">{error}</div>}

        <section className={styles.balanceSection} aria-labelledby="balance-title">
          <div>
            <span id="balance-title" className={styles.eyebrow}>사용 가능 잔액</span>
            <strong className={styles.balance}>{data?.balance.toLocaleString() ?? 0}</strong>
            <span className={styles.balanceUnit}>크레딧</span>
          </div>
          <div className={styles.welcomeInfo}>
            <LuCoins size={20} />
            <span>신규 가입 시 {data?.welcomeCredits ?? 30}크레딧이 자동 지급됩니다.</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="products-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="products-title">크레딧 충전</h2>
              <p>결제 승인이 끝난 뒤 잔액에 즉시 반영됩니다.</p>
            </div>
            <span className={styles.providerBadge}><RiKakaoTalkFill /> 카카오페이</span>
          </div>
          {!data?.provider.configured && (
            <div className={styles.setupNotice}>
              운영 결제 키 등록 전입니다. 관리자 설정이 끝나면 충전할 수 있습니다.
            </div>
          )}
          {data?.provider.testMode && data.provider.configured && (
            <div className={styles.setupNotice}>현재 카카오페이 테스트 결제 모드입니다.</div>
          )}
          <div className={styles.productGrid}>
            {data?.products.map((product) => (
              <article className={styles.product} key={product.code}>
                <div>
                  <span className={styles.productName}>{product.name}</span>
                  <div className={styles.productCredits}>{product.credits.toLocaleString()} 크레딧</div>
                  {product.bonusCredits ? <span className={styles.bonus}>보너스 {product.bonusCredits}</span> : null}
                </div>
                <div className={styles.productAction}>
                  <strong>{product.amountKrw.toLocaleString()}원</strong>
                  <button
                    type="button"
                    onClick={() => void startPayment(product.code)}
                    disabled={!data.provider.configured || paying !== null}
                  >
                    {paying === product.code ? <LuLoaderCircle className={styles.spin} /> : <RiKakaoTalkFill />}
                    결제
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className={styles.paymentAssurance}>
            <LuShieldCheck size={16} /> 결제 금액은 카카오페이 승인 결과를 서버에서 다시 확인한 뒤 적립합니다.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="costs-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="costs-title">작업별 사용량</h2>
              <p>실패한 AI 작업은 차감된 크레딧을 자동으로 돌려드립니다.</p>
            </div>
          </div>
          <div className={styles.costTable}>
            {data?.costs.map((cost) => (
              <div className={styles.costRow} key={cost.label}>
                <span>{cost.label}</span>
                <strong>{cost.credits} 크레딧</strong>
              </div>
            ))}
            <div className={styles.costFootnote}>영상 길이, 해상도, 오디오 옵션에 따라 추가 크레딧이 표시됩니다.</div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="history-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="history-title"><LuHistory size={18} /> 최근 크레딧 내역</h2>
              <p>충전, 사용, 환불 순서로 잔액 변화를 확인할 수 있습니다.</p>
            </div>
          </div>
          <div className={styles.historyTable}>
            {data?.ledger.length ? data.ledger.map((entry) => {
              const positive = entry.action === "purchase" || entry.action === "grant" || entry.action === "refund";
              return (
                <div className={styles.historyRow} key={entry.id}>
                  <div>
                    <strong>{ledgerLabel(entry.action, entry.source)}</strong>
                    <span>{formatDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}</span>
                  </div>
                  <div className={styles.historyAmount}>
                    <strong className={positive ? styles.amountPositive : styles.amountNegative}>
                      {positive ? "+" : "-"}{entry.units.toLocaleString()}
                    </strong>
                    {entry.balanceAfter !== null && <span>잔액 {entry.balanceAfter.toLocaleString()}</span>}
                  </div>
                </div>
              );
            }) : <div className={styles.empty}>아직 크레딧 내역이 없습니다.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
