"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tier: string;
  credits: number;
  tierUsedThisMonth: number;
  tierLimit: number;
  emailVerified: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleTierChange = async (userId: string, tier: string) => {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    loadUsers();
  };

  const handleAddCredits = async (userId: string) => {
    const amount = Number(creditInputs[userId]);
    if (!amount || amount <= 0) return;
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addCredits: amount }),
    });
    setCreditInputs((prev) => ({ ...prev, [userId]: "" }));
    loadUsers();
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>관리자 페이지</h1>
        <a href="/" className={styles.backLink}>메인으로</a>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>이메일</th>
              <th>이름</th>
              <th>Role</th>
              <th>Tier</th>
              <th>월간 사용량</th>
              <th>Credit</th>
              <th>인증</th>
              <th>가입일</th>
              <th>Tier 변경</th>
              <th>Credit 지급</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={styles.email}>{u.email}</td>
                <td>{u.name || "-"}</td>
                <td>
                  <span className={u.role === "admin" ? styles.adminBadge : styles.userBadge}>
                    {u.role}
                  </span>
                </td>
                <td>{u.tier}</td>
                <td>
                  {u.tierLimit === -1
                    ? `${u.tierUsedThisMonth} (무제한)`
                    : `${u.tierUsedThisMonth}/${u.tierLimit}`}
                </td>
                <td className={styles.creditCell}>{u.credits.toLocaleString()}</td>
                <td>{u.emailVerified ? "O" : "X"}</td>
                <td className={styles.date}>
                  {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td>
                  <select
                    className={styles.tierSelect}
                    value={u.tier}
                    onChange={(e) => handleTierChange(u.id, e.target.value)}
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </td>
                <td className={styles.creditAction}>
                  <input
                    className={styles.creditInput}
                    type="number"
                    min="1"
                    placeholder="수량"
                    value={creditInputs[u.id] || ""}
                    onChange={(e) =>
                      setCreditInputs((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    className={styles.creditBtn}
                    onClick={() => handleAddCredits(u.id)}
                    disabled={!creditInputs[u.id] || Number(creditInputs[u.id]) <= 0}
                  >
                    지급
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
