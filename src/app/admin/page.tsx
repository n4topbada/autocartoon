"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LuArrowLeft, LuCoins, LuLoaderCircle, LuRefreshCw } from "react-icons/lu";
import styles from "./page.module.css";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  kakaoLinked: boolean;
  emailVerified: boolean;
  paidPayments: number;
  createdAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [grantingUserId, setGrantingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as UserRow[] & { error?: string };
      if (!response.ok) throw new Error(data.error || "사용자 목록을 불러오지 못했습니다.");
      setUsers(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "사용자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const handleAddCredits = async (userId: string) => {
    const amount = Number(creditInputs[userId]);
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    setGrantingUserId(userId);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addCredits: amount }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "크레딧 지급에 실패했습니다.");
      setCreditInputs((previous) => ({ ...previous, [userId]: "" }));
      await loadUsers();
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "크레딧 지급에 실패했습니다.");
    } finally {
      setGrantingUserId(null);
    }
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.iconButton} aria-label="작업 화면으로 돌아가기" title="돌아가기">
            <LuArrowLeft size={19} />
          </Link>
          <div><h1 className={styles.title}>사용자 및 크레딧</h1><p>잔액과 결제 연결 상태를 관리합니다.</p></div>
        </div>
        <button className={styles.iconButton} type="button" onClick={() => void loadUsers()} title="새로고침">
          <LuRefreshCw size={17} />
        </button>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading ? (
        <div className={styles.loading}><LuLoaderCircle className={styles.spin} /> 사용자 목록을 불러오는 중</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>이메일</th><th>이름</th><th>권한</th><th>크레딧</th><th>카카오</th><th>결제</th><th>가입일</th><th>수동 지급</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className={styles.email}>{user.email}</td>
                  <td>{user.name || "-"}</td>
                  <td><span className={user.role === "admin" ? styles.adminBadge : styles.userBadge}>{user.role}</span></td>
                  <td className={styles.creditCell}>{user.credits.toLocaleString()}</td>
                  <td>{user.kakaoLinked ? "연결" : "-"}</td>
                  <td>{user.paidPayments.toLocaleString()}건</td>
                  <td className={styles.date}>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <div className={styles.creditAction}>
                      <input
                        className={styles.creditInput}
                        type="number"
                        min="1"
                        max="1000000"
                        aria-label={`${user.email} 크레딧 지급량`}
                        placeholder="수량"
                        value={creditInputs[user.id] || ""}
                        onChange={(event) => setCreditInputs((previous) => ({ ...previous, [user.id]: event.target.value }))}
                      />
                      <button
                        className={styles.creditBtn}
                        type="button"
                        onClick={() => void handleAddCredits(user.id)}
                        disabled={grantingUserId !== null || !creditInputs[user.id] || Number(creditInputs[user.id]) <= 0}
                      >
                        {grantingUserId === user.id ? <LuLoaderCircle className={styles.spin} /> : <LuCoins />}
                        지급
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className={styles.policySection}>
        <h2>운영 정책</h2>
        <p>신규 가입 30크레딧, 외부 AI 호출 전 차감, 실패 작업 자동 환불이 기본입니다. 수동 지급도 크레딧 원장에 관리자 ID와 함께 기록됩니다.</p>
        <Link href="/credits" className={styles.walletLink}>사용자 지갑 화면 보기</Link>
      </section>
    </main>
  );
}
