"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  LuCheck,
  LuCopy,
  LuDownload,
  LuLoaderCircle,
  LuPause,
  LuPencil,
  LuPlay,
  LuPlus,
  LuQrCode,
  LuRefreshCw,
  LuSave,
  LuTicket,
  LuX,
} from "react-icons/lu";
import { COUPON_CREDITS } from "@/lib/coupons";
import styles from "./CouponAdminPanel.module.css";

type RedemptionRow = {
  id: string;
  credits: number;
  balanceAfter: number;
  redeemedAt: string;
  user: { email: string; name: string | null };
};

type CouponRow = {
  id: string;
  code: string;
  title: string;
  credits: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  claimUrl: string;
  redemptions: RedemptionRow[];
};

type CouponForm = {
  title: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  active: boolean;
};

const EMPTY_FORM: CouponForm = {
  title: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "100",
  active: true,
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "요청 처리에 실패했습니다.");
  return body;
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formPayload(form: CouponForm) {
  return {
    title: form.title,
    active: form.active,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
  };
}

function periodLabel(campaign: CouponRow) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!campaign.startsAt && !campaign.endsAt) return "기간 제한 없음";
  const start = campaign.startsAt ? formatter.format(new Date(campaign.startsAt)) : "즉시";
  const end = campaign.endsAt ? formatter.format(new Date(campaign.endsAt)) : "계속";
  return `${start} ~ ${end}`;
}

function campaignStatus(campaign: CouponRow) {
  const now = Date.now();
  if (!campaign.active) return { label: "중지", tone: "paused" } as const;
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now) return { label: "대기", tone: "waiting" } as const;
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= now) return { label: "종료", tone: "ended" } as const;
  if (campaign.maxRedemptions !== null && campaign.redeemedCount >= campaign.maxRedemptions) return { label: "소진", tone: "ended" } as const;
  return { label: "사용 중", tone: "active" } as const;
}

export default function CouponAdminPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [campaigns, setCampaigns] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CouponForm>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [qrCampaign, setQrCampaign] = useState<CouponRow | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCampaigns(await readJson<CouponRow[]>(await fetch("/api/admin/coupons", { cache: "no-store" })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "쿠폰 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns, refreshKey]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await readJson<CouponRow>(await fetch("/api/admin/coupons", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...formPayload(form) }),
      }));
      resetForm();
      await loadCampaigns();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "쿠폰을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (campaign: CouponRow) => {
    setEditingId(campaign.id);
    setForm({
      title: campaign.title,
      startsAt: toLocalDateTime(campaign.startsAt),
      endsAt: toLocalDateTime(campaign.endsAt),
      maxRedemptions: campaign.maxRedemptions?.toString() ?? "",
      active: campaign.active,
    });
    document.getElementById("coupon-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleActive = async (campaign: CouponRow) => {
    setError("");
    try {
      await readJson<CouponRow>(await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          title: campaign.title,
          active: !campaign.active,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          maxRedemptions: campaign.maxRedemptions,
        }),
      }));
      await loadCampaigns();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "쿠폰 상태를 바꾸지 못했습니다.");
    }
  };

  const copy = async (value: string, key: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1600);
    } catch {
      setError("클립보드에 복사하지 못했습니다. 값을 직접 선택해 복사해주세요.");
    }
  };

  return (
    <section className={styles.section} aria-labelledby="coupon-admin-heading">
      <div className={styles.sectionHeader}>
        <div><LuTicket /><span><h2 id="coupon-admin-heading">강의 쿠폰</h2><p>가입 QR과 600C 지급 현황을 관리합니다.</p></span></div>
        <strong>{campaigns.filter((campaign) => campaignStatus(campaign).tone === "active").length}개 사용 중</strong>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.layout}>
        <form id="coupon-editor" className={styles.form} onSubmit={submit}>
          <div className={styles.formTitle}>
            <strong>{editingId ? "쿠폰 수정" : "새 쿠폰"}</strong>
            {editingId && <button type="button" onClick={resetForm} title="수정 취소" aria-label="수정 취소"><LuX /></button>}
          </div>
          <div className={styles.fixedReward}><span>지급 크레딧</span><strong>{COUPON_CREDITS}C</strong></div>
          <label>강의·이벤트 이름
            <input required maxLength={80} value={form.title} placeholder="예: 웹툰 AI 실습 특강" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <div className={styles.dateGrid}>
            <label>시작 시각 <small>선택</small>
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
            </label>
            <label>종료 시각 <small>선택</small>
              <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
            </label>
          </div>
          <label>최대 지급 인원 <small>비우면 무제한</small>
            <input type="number" min="1" max="100000" value={form.maxRedemptions} onChange={(event) => setForm((current) => ({ ...current, maxRedemptions: event.target.value }))} />
          </label>
          <label className={styles.activeCheck}><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> 생성 즉시 사용 가능</label>
          <button className={styles.saveButton} type="submit" disabled={saving}>
            {saving ? <LuLoaderCircle className={styles.spin} /> : editingId ? <LuSave /> : <LuPlus />}
            {editingId ? "변경 저장" : "쿠폰 만들기"}
          </button>
        </form>

        <div className={styles.list} aria-live="polite">
          <div className={styles.listToolbar}>
            <span>총 {campaigns.length}개 캠페인</span>
            <button type="button" onClick={() => void loadCampaigns()} title="쿠폰 목록 새로고침" aria-label="쿠폰 목록 새로고침"><LuRefreshCw /></button>
          </div>
          {loading ? (
            <div className={styles.state}><LuLoaderCircle className={styles.spin} /> 쿠폰을 불러오는 중</div>
          ) : campaigns.length === 0 ? (
            <div className={styles.state}>아직 만든 쿠폰이 없습니다.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>쿠폰</th><th>기간</th><th>지급 현황</th><th>상태</th><th>도구</th></tr></thead>
                <tbody>
                  {campaigns.map((campaign) => {
                    const status = campaignStatus(campaign);
                    return (
                      <tr key={campaign.id}>
                        <td><strong>{campaign.title}</strong><button className={styles.codeButton} type="button" onClick={() => void copy(campaign.code, `code:${campaign.id}`)} title="쿠폰 코드 복사"><code>{campaign.code}</code>{copied === `code:${campaign.id}` ? <LuCheck /> : <LuCopy />}</button></td>
                        <td className={styles.period}>{periodLabel(campaign)}</td>
                        <td><strong className={styles.progress}>{campaign.redeemedCount.toLocaleString()}</strong> / {campaign.maxRedemptions?.toLocaleString() ?? "무제한"}<small>{campaign.credits.toLocaleString()}C씩</small></td>
                        <td><span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span></td>
                        <td><div className={styles.tools}>
                          <button type="button" onClick={() => edit(campaign)} title="쿠폰 설정 수정" aria-label={`${campaign.title} 수정`}><LuPencil /></button>
                          <button type="button" onClick={() => void toggleActive(campaign)} title={campaign.active ? "쿠폰 중지" : "쿠폰 다시 시작"} aria-label={campaign.active ? `${campaign.title} 중지` : `${campaign.title} 다시 시작`}>{campaign.active ? <LuPause /> : <LuPlay />}</button>
                          <button type="button" onClick={() => void copy(campaign.claimUrl, `url:${campaign.id}`)} title="쿠폰 링크 복사" aria-label={`${campaign.title} 링크 복사`}>{copied === `url:${campaign.id}` ? <LuCheck /> : <LuCopy />}</button>
                          <button type="button" onClick={() => setQrCampaign(campaign)} title="QR 보기" aria-label={`${campaign.title} QR 보기`}><LuQrCode /></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {qrCampaign && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setQrCampaign(null);
        }}>
          <section className={styles.qrDialog} role="dialog" aria-modal="true" aria-labelledby="qr-title">
            <header><span><LuQrCode /><strong id="qr-title">강의용 QR</strong></span><button type="button" onClick={() => setQrCampaign(null)} title="닫기" aria-label="닫기"><LuX /></button></header>
            <div className={styles.qrBody}>
              <div className={styles.qrImage}>
                {/* Authenticated API images need the browser session cookie, so native img is intentional. */}
                <img src={`/api/admin/coupons/${encodeURIComponent(qrCampaign.id)}/qr`} alt={`${qrCampaign.title} 쿠폰 QR`} width="960" height="960" />
              </div>
              <div className={styles.qrInfo}>
                <strong>{qrCampaign.title}</strong>
                <code>{qrCampaign.code}</code>
                <p>{COUPON_CREDITS}C · {qrCampaign.redeemedCount.toLocaleString()}명 지급</p>
              </div>
              <div className={styles.qrActions}>
                <button type="button" onClick={() => void copy(qrCampaign.claimUrl, `modal:${qrCampaign.id}`)}>{copied === `modal:${qrCampaign.id}` ? <LuCheck /> : <LuCopy />} 링크 복사</button>
                <a href={`/api/admin/coupons/${encodeURIComponent(qrCampaign.id)}/qr?download=1`}><LuDownload /> PNG 다운로드</a>
              </div>
              {qrCampaign.redemptions.length > 0 && (
                <div className={styles.recent}>
                  <strong>최근 지급</strong>
                  {qrCampaign.redemptions.map((redemption) => (
                    <div key={redemption.id}><span>{redemption.user.name || redemption.user.email}</span><time>{new Date(redemption.redeemedAt).toLocaleString("ko-KR")}</time></div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
