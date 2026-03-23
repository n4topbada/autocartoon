"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./Board.module.css";
import { useAuth } from "./AuthProvider";
import {
  LuPlus,
  LuTrash2,
  LuMessageSquare,
  LuLink2,
  LuChevronLeft,
  LuSend,
} from "react-icons/lu";

interface PostSummary {
  id: string;
  title: string;
  content: string;
  userName: string;
  userEmail: string;
  commentCount: number;
  imageUrls: string[];
  links: string[];
  createdAt: string;
}

interface PostDetail extends PostSummary {
  comments: {
    id: string;
    content: string;
    userName: string;
    createdAt: string;
    userId: string;
  }[];
}

export default function Board() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [showWrite, setShowWrite] = useState(false);

  // 글 작성 상태
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  // 댓글 상태
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);

  const isAdmin = user?.role === "admin";

  const loadPosts = useCallback(() => {
    setLoading(true);
    fetch("/api/board")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPosts(data);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const loadPost = async (id: string) => {
    const res = await fetch(`/api/board/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedPost(data);
    }
  };

  const handlePost = async () => {
    if (!title.trim() || !content.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          links: links.length > 0 ? links : undefined,
        }),
      });
      if (res.ok) {
        setTitle("");
        setContent("");
        setLinks([]);
        setShowWrite(false);
        loadPosts();
      }
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 글을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/board/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelectedPost(null);
      loadPosts();
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() || !selectedPost) return;
    setCommenting(true);
    try {
      const res = await fetch(`/api/board/${selectedPost.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText("");
        loadPost(selectedPost.id);
      }
    } finally {
      setCommenting(false);
    }
  };

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    setLinks((prev) => [...prev, url]);
    setLinkInput("");
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  // 글 상세 보기
  if (selectedPost) {
    return (
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => setSelectedPost(null)}>
          <LuChevronLeft size={16} /> 목록으로
        </button>

        <article className={styles.article}>
          <h2 className={styles.articleTitle}>{selectedPost.title}</h2>
          <div className={styles.articleMeta}>
            <span>{selectedPost.userName}</span>
            <span>{formatDate(selectedPost.createdAt)}</span>
            {(selectedPost.userEmail === user?.email || isAdmin) && (
              <button className={styles.deleteBtn} onClick={() => handleDelete(selectedPost.id)}>
                <LuTrash2 size={12} /> 삭제
              </button>
            )}
          </div>

          <div className={styles.articleContent}>
            {selectedPost.content.split("\n").map((line, i) => (
              <p key={i}>{line || "\u00A0"}</p>
            ))}
          </div>

          {/* 이미지 */}
          {selectedPost.imageUrls.length > 0 && (
            <div className={styles.articleImages}>
              {selectedPost.imageUrls.map((url, i) => (
                <img key={i} src={url} alt={`image-${i}`} className={styles.articleImg} />
              ))}
            </div>
          )}

          {/* 링크 */}
          {selectedPost.links.length > 0 && (
            <div className={styles.articleLinks}>
              {selectedPost.links.map((link, i) => (
                <div key={i} className={styles.linkPreview}>
                  {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(link) ? (
                    <img src={link} alt="link preview" className={styles.linkImg} />
                  ) : (
                    <a href={link} target="_blank" rel="noopener noreferrer" className={styles.linkUrl}>
                      <LuLink2 size={12} /> {link}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 댓글 */}
          <div className={styles.comments}>
            <h3 className={styles.commentsTitle}>
              <LuMessageSquare size={14} /> 댓글 {selectedPost.comments.length}
            </h3>
            {selectedPost.comments.map((c) => (
              <div key={c.id} className={styles.comment}>
                <div className={styles.commentHeader}>
                  <span className={styles.commentAuthor}>{c.userName}</span>
                  <span className={styles.commentDate}>{formatDate(c.createdAt)}</span>
                </div>
                <p className={styles.commentContent}>{c.content}</p>
              </div>
            ))}
            <div className={styles.commentInput}>
              <input
                type="text"
                placeholder="댓글을 입력하세요..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleComment(); }}
                className={styles.commentField}
              />
              <button
                className={styles.commentSendBtn}
                onClick={handleComment}
                disabled={commenting || !commentText.trim()}
              >
                <LuSend size={14} />
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  // 글 작성 폼
  if (showWrite) {
    return (
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => setShowWrite(false)}>
          <LuChevronLeft size={16} /> 취소
        </button>

        <div className={styles.writeForm}>
          <h2 className={styles.writeTitle}>새 글 작성</h2>
          <input
            type="text"
            className={styles.writeInput}
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={styles.writeTextarea}
            placeholder="내용을 입력하세요..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
          />

          <div className={styles.linkSection}>
            <h3 className={styles.linkLabel}>외부 링크</h3>
            <div className={styles.linkInputRow}>
              <input
                type="text"
                className={styles.linkField}
                placeholder="https://..."
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
              />
              <button className={styles.linkAddBtn} onClick={addLink}>
                <LuPlus size={14} />
              </button>
            </div>
            {links.map((link, i) => (
              <div key={i} className={styles.linkItem}>
                <span>{link}</span>
                <button onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>

          <button
            className={styles.submitBtn}
            onClick={handlePost}
            disabled={posting || !title.trim() || !content.trim()}
          >
            {posting ? "게시 중..." : "게시하기"}
          </button>
        </div>
      </div>
    );
  }

  // 글 목록
  return (
    <div className={styles.container}>
      <div className={styles.boardHeader}>
        <h2 className={styles.boardTitle}>게시판</h2>
        <button className={styles.writeBtn} onClick={() => setShowWrite(true)}>
          <LuPlus size={14} /> 글 작성
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingText}>불러오는 중...</div>
      ) : posts.length === 0 ? (
        <div className={styles.emptyText}>아직 게시글이 없습니다.</div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => (
            <div
              key={post.id}
              className={styles.postCard}
              onClick={() => loadPost(post.id)}
            >
              {post.imageUrls.length > 0 && (
                <img src={post.imageUrls[0]} alt="" className={styles.postThumb} />
              )}
              <div className={styles.postInfo}>
                <h3 className={styles.postTitle}>{post.title}</h3>
                <p className={styles.postSnippet}>
                  {post.content.length > 60 ? post.content.slice(0, 60) + "..." : post.content}
                </p>
                <div className={styles.postMeta}>
                  <span>{post.userName}</span>
                  <span>{formatDate(post.createdAt)}</span>
                  <span><LuMessageSquare size={11} /> {post.commentCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
