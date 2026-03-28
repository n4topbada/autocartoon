"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./InstagramTab.module.css";
import { LuInstagram, LuRefreshCw, LuExternalLink, LuPlus, LuUnplug } from "react-icons/lu";

interface AccountInfo {
  username: string;
  profilePicture: string;
  followers: number;
}

interface InsightsData {
  account: AccountInfo;
  insights: {
    followers: number;
    reach: number;
    impressions: number;
    totalLikes: number;
    totalComments: number;
    totalSaves: number;
    totalShares: number;
  };
  postCount: number;
}

interface IgPost {
  id: string;
  igMediaId: string;
  caption: string;
  permalink: string;
  publishedAt: string;
  imageUrl: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export default function InstagramTab() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/insights");
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/instagram/posts");
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    checkConnection();
    loadPosts();
  }, [checkConnection, loadPosts]);

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/instagram/auth");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* ignore */ }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Instagram 연동을 해제하시겠습니까?")) return;
    await fetch("/api/instagram/disconnect", { method: "DELETE" });
    setConnected(false);
    setInsights(null);
    setPosts([]);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>불러오는 중...</div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={styles.container}>
        <div className={styles.connectCard}>
          <LuInstagram size={48} />
          <h2>Instagram 연동</h2>
          <p>Instagram Business 계정을 연동하여 이미지를 직접 발행하고 인사이트를 확인하세요.</p>
          <button className={styles.connectBtn} onClick={handleConnect}>
            <LuInstagram size={16} /> Instagram 연동하기
          </button>
          <p className={styles.hint}>
            Instagram Business/Creator 계정 + Facebook 페이지가 필요합니다.
          </p>
        </div>
      </div>
    );
  }

  const { account, insights: ins } = insights || { account: null, insights: null };

  return (
    <div className={styles.container}>
      {/* 계정 정보 */}
      <div className={styles.accountBar}>
        <div className={styles.accountInfo}>
          {account?.profilePicture && (
            <img src={account.profilePicture} alt="" className={styles.profilePic} />
          )}
          <span className={styles.username}>@{account?.username}</span>
          <span className={styles.badge}>연동됨</span>
        </div>
        <div className={styles.accountActions}>
          <button className={styles.smallBtn} onClick={() => { checkConnection(); loadPosts(); }}>
            <LuRefreshCw size={14} />
          </button>
          <button className={styles.smallBtn} onClick={handleDisconnect} title="연동 해제">
            <LuUnplug size={14} />
          </button>
        </div>
      </div>

      {/* 대시보드 카드 */}
      {ins && (
        <div className={styles.dashboard}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.followers.toLocaleString()}</span>
            <span className={styles.statLabel}>팔로워</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.reach.toLocaleString()}</span>
            <span className={styles.statLabel}>도달 (30일)</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.totalLikes.toLocaleString()}</span>
            <span className={styles.statLabel}>좋아요</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.totalSaves.toLocaleString()}</span>
            <span className={styles.statLabel}>저장</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.totalComments.toLocaleString()}</span>
            <span className={styles.statLabel}>댓글</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{ins.totalShares.toLocaleString()}</span>
            <span className={styles.statLabel}>공유</span>
          </div>
        </div>
      )}

      {/* 발행된 게시물 */}
      <div className={styles.postsSection}>
        <h3 className={styles.postsTitle}>
          발행된 게시물 ({posts.length})
        </h3>

        {posts.length === 0 ? (
          <p className={styles.emptyText}>아직 발행된 게시물이 없습니다.</p>
        ) : (
          <div className={styles.postsGrid}>
            {posts.map((post) => (
              <div key={post.id} className={styles.postCard}>
                {post.imageUrl && (
                  <img src={post.imageUrl} alt="" className={styles.postImg} />
                )}
                <div className={styles.postStats}>
                  <span>❤ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                  <span>🔖 {post.saves}</span>
                  <span>👁 {post.reach}</span>
                </div>
                <div className={styles.postCaption}>
                  {post.caption?.slice(0, 50) || "캡션 없음"}
                </div>
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={styles.postLink}>
                    <LuExternalLink size={12} /> Instagram에서 보기
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
