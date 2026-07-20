"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  LuActivity,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuCircleAlert,
  LuCopy,
  LuLoaderCircle,
  LuRefreshCw,
  LuRoute,
  LuSearch,
  LuShieldCheck,
  LuX,
} from "react-icons/lu";
import styles from "./CreditAuditAdminPanel.module.css";

interface AuditParty {
  id: string;
  name: string | null;
  accountKey: string;
  email: string;
}

interface AuditEvent {
  id: string;
  traceId: string;
  referenceId: string | null;
  ledgerId: string | null;
  jobId: string | null;
  status: string;
  statusLabel: string;
  direction: string;
  directionLabel: string;
  operation: string;
  operationLabel: string;
  source: string;
  sourceLabel: string;
  units: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  balanceVerified: boolean | null;
  reasonCode: string | null;
  summary: string;
  errorMessage: string | null;
  createdAt: string;
  user: AuditParty | null;
  actor: AuditParty | null;
  details: Array<{ key: string; label: string; value: string }>;
}

interface AuditResponse {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  summary: {
    succeeded: number;
    failed: number;
    credited: number;
    debited: number;
    refunded: number;
    integrityFailures: number;
  };
  filters: {
    sources: Array<{ value: string; label: string }>;
    operations: Array<{ value: string; label: string }>;
  };
  events: AuditEvent[];
}

const EMPTY_RESPONSE: AuditResponse = {
  page: 1,
  pageSize: 40,
  total: 0,
  hasMore: false,
  summary: { succeeded: 0, failed: 0, credited: 0, debited: 0, refunded: 0, integrityFailures: 0 },
  filters: { sources: [], operations: [] },
  events: [],
};

async function readResponse(response: Response) {
  const body = await response.json() as AuditResponse & { error?: string };
  if (!response.ok) throw new Error(body.error || "크레딧 감사 기록을 불러오지 못했습니다.");
  return body;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatAmount(event: AuditEvent) {
  const units = event.units.toLocaleString("ko-KR");
  if (event.units === 0) return "변경 없음";
  if (event.status === "failure") return units + " C 시도";
  if (event.direction === "credit") return "+" + units + " C";
  if (event.direction === "debit") return "-" + units + " C";
  return units + " C 확인";
}

function formatBalance(event: AuditEvent) {
  if (event.balanceBefore === null || event.balanceAfter === null) return "잔액 확인 대상 아님";
  return event.balanceBefore.toLocaleString("ko-KR") + " → " + event.balanceAfter.toLocaleString("ko-KR") + " C";
}

export default function CreditAuditAdminPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<AuditResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [source, setSource] = useState("all");
  const [operation, setOperation] = useState("all");
  const [range, setRange] = useState("7d");
  const [integrity, setIntegrity] = useState("all");
  const [page, setPage] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState("");

  const loadAudit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      status,
      direction,
      source,
      operation,
      range,
      integrity,
      page: String(page),
    });
    if (query) params.set("q", query);
    try {
      const result = await readResponse(await fetch("/api/admin/credit-audit?" + params.toString(), {
        cache: "no-store",
        signal,
      }));
      setData(result);
      setExpandedId((current) =>
        current && result.events.some((event) => event.id === current) ? current : null
      );
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "크레딧 감사 기록을 불러오지 못했습니다.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [direction, integrity, operation, page, query, range, source, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAudit(controller.signal);
    return () => controller.abort();
  }, [loadAudit, refreshKey, refreshNonce]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  };

  const resetFilters = () => {
    setQueryInput("");
    setQuery("");
    setStatus("all");
    setDirection("all");
    setSource("all");
    setOperation("all");
    setRange("7d");
    setIntegrity("all");
    setPage(1);
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue((current) => current === value ? "" : current), 1400);
  };

  const followTrace = (traceId: string) => {
    setQueryInput(traceId);
    setQuery(traceId);
    setPage(1);
    document.getElementById("credit-audit-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const filtersActive =
    Boolean(query) ||
    [status, direction, source, operation, integrity].some((value) => value !== "all") ||
    range !== "7d";

  return (
    <section className={styles.section} aria-labelledby="credit-audit-heading">
      <header className={styles.header}>
        <div>
          <LuActivity aria-hidden="true" />
          <span>
            <h2 id="credit-audit-heading">크레딧 감사 기록</h2>
            <p>차감, 충전, 지급, 환불과 실패 원인을 잔액 검증 및 추적 코드로 확인합니다.</p>
          </span>
        </div>
        <button type="button" className={styles.refreshButton} onClick={() => setRefreshNonce((value) => value + 1)} title="감사 기록 새로고침" aria-label="감사 기록 새로고침">
          <LuRefreshCw className={loading ? styles.spin : undefined} />
        </button>
      </header>

      <div className={styles.summary} aria-label="현재 검색 결과 요약">
        <span><small>성공</small><strong>{data.summary.succeeded.toLocaleString("ko-KR")}건</strong></span>
        <span className={data.summary.failed > 0 ? styles.summaryDanger : undefined}><small>실패</small><strong>{data.summary.failed.toLocaleString("ko-KR")}건</strong></span>
        <span><small>충전·지급</small><strong>+{data.summary.credited.toLocaleString("ko-KR")} C</strong></span>
        <span><small>사용·차감</small><strong>-{data.summary.debited.toLocaleString("ko-KR")} C</strong></span>
        <span><small>자동 환불</small><strong>{data.summary.refunded.toLocaleString("ko-KR")} C</strong></span>
        <span className={data.summary.integrityFailures > 0 ? styles.summaryDanger : styles.summaryVerified}>
          <small>잔액 검증</small>
          <strong>{data.summary.integrityFailures > 0 ? "불일치 " + data.summary.integrityFailures + "건" : "정상"}</strong>
        </span>
      </div>

      <div className={styles.tools}>
        <form className={styles.search} onSubmit={applySearch}>
          <LuSearch aria-hidden="true" />
          <input
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="계정, 이름, CR-추적코드, 작업·결제 ID"
            aria-label="크레딧 감사 기록 검색"
          />
          {queryInput && (
            <button type="button" onClick={() => {
              setQueryInput("");
              if (query) { setQuery(""); setPage(1); }
            }} title="검색어 지우기"><LuX /></button>
          )}
          <button type="submit" title="검색"><LuSearch /></button>
        </form>
        <div className={styles.filters}>
          <label><span>기간</span><select value={range} onChange={(event) => updateFilter(setRange, event.target.value)}><option value="24h">24시간</option><option value="7d">7일</option><option value="30d">30일</option><option value="90d">90일</option><option value="all">전체</option></select></label>
          <label><span>결과</span><select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)}><option value="all">전체</option><option value="success">성공</option><option value="failure">실패</option></select></label>
          <label><span>구분</span><select value={direction} onChange={(event) => updateFilter(setDirection, event.target.value)}><option value="all">전체</option><option value="credit">충전·지급</option><option value="debit">사용·차감</option><option value="neutral">검증·상태</option></select></label>
          <label><span>기능</span><select value={source} onChange={(event) => updateFilter(setSource, event.target.value)}><option value="all">전체</option>{data.filters.sources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>행위</span><select value={operation} onChange={(event) => updateFilter(setOperation, event.target.value)}><option value="all">전체</option>{data.filters.operations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>검증</span><select value={integrity} onChange={(event) => updateFilter(setIntegrity, event.target.value)}><option value="all">전체</option><option value="failed">잔액 불일치</option></select></label>
          {filtersActive && <button type="button" className={styles.resetButton} onClick={resetFilters}><LuX /> 초기화</button>}
        </div>
      </div>

      {error && <div className={styles.error} role="alert"><LuCircleAlert /> {error}</div>}

      <div className={styles.resultMeta}>
        <span>검색 결과 <strong>{data.total.toLocaleString("ko-KR")}건</strong></span>
        {query && <span><LuRoute /> <code>{query}</code></span>}
      </div>

      <div className={styles.list} aria-live="polite" aria-busy={loading}>
        {loading && data.events.length === 0 ? (
          <div className={styles.state}><LuLoaderCircle className={styles.spin} /> 감사 기록을 정리하는 중</div>
        ) : data.events.length === 0 ? (
          <div className={styles.state}><LuShieldCheck /> 조건에 맞는 기록이 없습니다.</div>
        ) : data.events.map((event) => {
          const failed = event.status === "failure";
          const expanded = expandedId === event.id;
          const amountClass = failed ? styles.failedAmount : event.direction === "credit" ? styles.creditAmount : "";
          return (
            <article key={event.id} className={styles.row + " " + (failed ? styles.failedRow : styles.successRow)}>
              <div className={styles.rowMain}>
                <div className={styles.statusCell}>
                  <span className={failed ? styles.failedBadge : styles.successBadge}>{failed ? <LuX /> : <LuCheck />}{event.statusLabel}</span>
                  <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                </div>
                <div className={styles.eventCell}>
                  <strong>{event.summary}</strong>
                  <span>{event.sourceLabel} · {event.operationLabel}</span>
                </div>
                <div className={styles.userCell}>
                  <strong>{event.user?.name || "이름 없음"}</strong>
                  <code>{event.user?.accountKey || "계정 정보 없음"}</code>
                </div>
                <div className={styles.amountCell + " " + amountClass}>
                  <strong>{formatAmount(event)}</strong>
                  <span>{event.directionLabel}</span>
                </div>
                <div className={styles.balanceCell}>
                  <span>{formatBalance(event)}</span>
                  {event.balanceVerified === true && <small><LuShieldCheck /> 검증 완료</small>}
                  {event.balanceVerified === false && <small className={styles.integrityFailed}><LuCircleAlert /> 잔액 불일치</small>}
                </div>
                <button type="button" className={styles.expandButton} onClick={() => setExpandedId(expanded ? null : event.id)} aria-expanded={expanded} title={expanded ? "세부 정보 닫기" : "세부 정보 보기"}>
                  {expanded ? <LuChevronUp /> : <LuChevronDown />}
                </button>
              </div>

              {expanded && (
                <div className={styles.detail}>
                  {failed && <div className={styles.failureReason}><LuCircleAlert /><span><strong>{event.reasonCode || "처리 실패"}</strong><p>{event.errorMessage || "추가 오류 메시지가 없습니다."}</p></span></div>}
                  <div className={styles.detailGrid}>
                    <span><small>추적 코드</small><code>{event.traceId}</code><button type="button" onClick={() => void copyValue(event.traceId)} title="추적 코드 복사">{copiedValue === event.traceId ? <LuCheck /> : <LuCopy />}</button></span>
                    <span><small>이벤트 ID</small><code>{event.id}</code><button type="button" onClick={() => void copyValue(event.id)} title="이벤트 ID 복사">{copiedValue === event.id ? <LuCheck /> : <LuCopy />}</button></span>
                    {event.jobId && <span><small>생성 작업 ID</small><code>{event.jobId}</code><button type="button" onClick={() => void copyValue(event.jobId as string)} title="작업 ID 복사">{copiedValue === event.jobId ? <LuCheck /> : <LuCopy />}</button></span>}
                    {event.referenceId && <span><small>연결 참조</small><code>{event.referenceId}</code><button type="button" onClick={() => void copyValue(event.referenceId as string)} title="참조값 복사">{copiedValue === event.referenceId ? <LuCheck /> : <LuCopy />}</button></span>}
                    {event.ledgerId && <span><small>원장 ID</small><code>{event.ledgerId}</code></span>}
                    {event.actor && <span><small>처리자</small><strong>{event.actor.name || event.actor.accountKey}</strong><code>{event.actor.accountKey}</code></span>}
                  </div>
                  {event.details.length > 0 && <dl className={styles.metadata}>{event.details.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
                  <div className={styles.detailActions}>
                    <button type="button" onClick={() => followTrace(event.traceId)}><LuRoute /> 같은 흐름만 보기</button>
                    <button type="button" onClick={() => void copyValue(event.traceId)}>{copiedValue === event.traceId ? <LuCheck /> : <LuCopy />} 추적 코드 복사</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {data.total > data.pageSize && (
        <nav className={styles.pagination} aria-label="크레딧 감사 기록 페이지">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} title="이전 페이지"><LuChevronLeft /></button>
          <span>{page.toLocaleString("ko-KR")} / {Math.ceil(data.total / data.pageSize).toLocaleString("ko-KR")}</span>
          <button type="button" onClick={() => setPage((value) => value + 1)} disabled={!data.hasMore || loading} title="다음 페이지"><LuChevronRight /></button>
        </nav>
      )}
    </section>
  );
}
