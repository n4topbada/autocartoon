"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./ChatBot.module.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatBotProps {
  open: boolean;
  onClose: () => void;
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "안녕하세요! 워니봇이에요 🤖\n워니의 Autocartoon Bot 서비스에 대해 궁금한 점이 있으시면 편하게 물어보세요!",
};

export default function ChatBot({ open, onClose }: ChatBotProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const history = updatedMessages
        .filter((m) => m !== WELCOME_MESSAGE)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "요청에 실패했어요.");
      }

      const data = await res.json();
      const botMsg: Message = { role: "assistant", content: data.reply };
      setMessages((prev) => [...prev, botMsg]);

      if (data.needHuman) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "실제 상담원에게 연결해 드릴까요? 아래 버튼을 눌러주세요.",
          },
        ]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "오류가 발생했어요.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `오류: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  const requestHumanHelp = async () => {
    if (helpSent) return;
    setHelpSent(true);

    const recentMessages = messages
      .slice(-6)
      .map((m) => `${m.role === "user" ? "사용자" : "봇"}: ${m.content}`)
      .join("\n");

    try {
      await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: recentMessages }),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "상담 요청이 접수되었어요! 빠른 시간 내에 답변 드리겠습니다.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "상담 요청 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        },
      ]);
      setHelpSent(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>워니봇 💬</span>
          <button className={styles.closeBtn} onClick={onClose} title="닫기">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={
                msg.role === "user" ? styles.bubbleUser : styles.bubbleBot
              }
            >
              {msg.content}
            </div>
          ))}
          {loading && <div className={styles.typing}>입력 중...</div>}
          <div ref={messagesEndRef} />
        </div>

        <button
          className={styles.helpBtn}
          onClick={requestHumanHelp}
          disabled={helpSent}
        >
          🆘 사람에게 연결하기
        </button>

        <div className={styles.inputArea}>
          <input
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            disabled={loading}
          />
          <button
            className={styles.sendBtn}
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            전송
          </button>
        </div>
      </div>
    </>
  );
}
