"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  LuBot,
  LuPanelRight,
  LuRotateCcw,
  LuSend,
  LuSparkles,
  LuUserRound,
} from "react-icons/lu";
import {
  createEmptyCharacterDesign,
  type CharacterDesign,
  type CharacterDesignerMessage,
  type CharacterDesignerResult,
} from "@/lib/character-designer-types";
import styles from "./CharacterDesigner.module.css";

interface UiMessage extends CharacterDesignerMessage {
  id: string;
}

const STORAGE_KEY = "autocartoon.character-designer.draft.v1";
const WELCOME_MESSAGE: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "어떤 캐릭터를 만들까요? 떠오른 장면이나 성격 한 가지만 말해도 설정 초안을 잡아드릴게요.",
};

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isStoredDesign(value: unknown): value is CharacterDesign {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CharacterDesign>;
  return (
    typeof candidate.characterName === "string" &&
    Array.isArray(candidate.sections) &&
    candidate.sections.length <= 12 &&
    candidate.sections.every(
      (section) =>
        section &&
        typeof section.key === "string" &&
        typeof section.title === "string" &&
        typeof section.summary === "string" &&
        Array.isArray(section.details) &&
        section.details.length <= 10 &&
        section.details.every(
          (detail) =>
            detail &&
            typeof detail.label === "string" &&
            typeof detail.value === "string"
        )
    )
  );
}

function isDesignerResult(value: unknown): value is CharacterDesignerResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CharacterDesignerResult>;
  return (
    typeof result.reply === "string" &&
    isStoredDesign({
      characterName: result.characterName,
      sections: result.sections,
    }) &&
    Array.isArray(result.nextQuestions) &&
    result.nextQuestions.length <= 4 &&
    result.nextQuestions.every((question) => typeof question === "string")
  );
}

export default function CharacterDesigner() {
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME_MESSAGE]);
  const [design, setDesign] = useState<CharacterDesign>(createEmptyCharacterDesign);
  const [input, setInput] = useState("");
  const [nextQuestions, setNextQuestions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredDesign(parsed)) setDesign(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(design));
  }, [design, storageReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const resetDraft = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setDesign(createEmptyCharacterDesign());
    setNextQuestions([]);
    setInput("");
    setError(null);
    window.sessionStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: UiMessage = {
      id: createMessageId(),
      role: "user",
      content: text,
    };
    const history = messages
      .filter((message) => message.id !== WELCOME_MESSAGE.id)
      .map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await fetch("/api/character-designer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          currentDesign: design,
        }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "캐릭터 설정 요청에 실패했습니다.";
        throw new Error(message);
      }
      if (!isDesignerResult(data)) {
        throw new Error("캐릭터 설정 응답 형식이 올바르지 않습니다.");
      }

      setDesign({
        characterName: data.characterName,
        sections: data.sections,
      });
      setNextQuestions(data.nextQuestions);
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: data.reply,
        },
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "캐릭터 설정 요청에 실패했습니다.";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [design, input, messages, sending]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const useQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  return (
    <section className={styles.root} aria-label="캐릭터 설계">
      <div className={styles.chatPane}>
        <header className={styles.paneHeader}>
          <div className={styles.headerIdentity}>
            <span className={styles.headerIcon} aria-hidden="true">
              <LuBot size={19} />
            </span>
            <div>
              <h2 className={styles.headerTitle}>캐릭터 디렉터</h2>
              <span className={styles.status}>
                <span className={styles.statusDot} />
                설계 중
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={resetDraft}
            title="새 설정 시작"
            aria-label="새 설정 시작"
          >
            <LuRotateCcw size={17} />
          </button>
        </header>

        <div className={styles.messages} aria-live="polite">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.messageRow} ${
                message.role === "user" ? styles.messageRowUser : ""
              }`}
            >
              <span
                className={`${styles.messageAvatar} ${
                  message.role === "user" ? styles.userAvatar : styles.botAvatar
                }`}
                aria-hidden="true"
              >
                {message.role === "user" ? (
                  <LuUserRound size={16} />
                ) : (
                  <LuSparkles size={16} />
                )}
              </span>
              <div
                className={`${styles.messageBubble} ${
                  message.role === "user"
                    ? styles.userBubble
                    : styles.assistantBubble
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className={styles.messageRow}>
              <span className={`${styles.messageAvatar} ${styles.botAvatar}`}>
                <LuSparkles size={16} />
              </span>
              <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>
                <span className={styles.typingDots} aria-label="설정 생성 중">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {nextQuestions.length > 0 && (
          <div className={styles.suggestions} aria-label="추천 질문">
            {nextQuestions.map((question) => (
              <button
                type="button"
                key={question}
                className={styles.suggestionButton}
                onClick={() => useQuestion(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.composer}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="캐릭터 아이디어를 입력하세요"
            rows={3}
            maxLength={4000}
            disabled={sending}
          />
          <button
            type="button"
            className={styles.sendButton}
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            title="보내기"
            aria-label="보내기"
          >
            <LuSend size={18} />
          </button>
        </div>
      </div>

      <div className={styles.settingsPane}>
        <header className={styles.settingsHeader}>
          <div className={styles.settingsTitleRow}>
            <LuPanelRight size={18} aria-hidden="true" />
            <h2 className={styles.settingsTitle}>캐릭터 설정</h2>
          </div>
          <span className={styles.sectionCount}>{design.sections.length}개 항목</span>
        </header>

        <div className={styles.nameBand}>
          <span className={styles.nameLabel}>이름</span>
          <strong className={styles.characterName}>{design.characterName}</strong>
          <span className={styles.draftBadge}>DRAFT</span>
        </div>

        <div className={styles.sectionGrid}>
          {design.sections.map((section, index) => (
            <article
              key={`${section.key}-${index}`}
              className={styles.sectionCard}
            >
              <header className={styles.sectionHeader}>
                <span className={styles.sectionIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className={styles.sectionTitle}>{section.title}</h3>
              </header>
              <p className={styles.sectionSummary}>{section.summary}</p>

              {section.details.length > 0 && (
                <dl className={styles.detailList}>
                  {section.details.map((detail, detailIndex) => (
                    <div
                      key={`${detail.label}-${detailIndex}`}
                      className={styles.detailRow}
                    >
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
