"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  LuBot,
  LuCheck,
  LuCopy,
  LuFileText,
  LuPanelRight,
  LuPlus,
  LuRotateCcw,
  LuSend,
  LuSparkles,
  LuTrash2,
  LuUserRound,
  LuX,
} from "react-icons/lu";
import { buildCharacterDesignerSystemPrompt } from "@/lib/character-designer";
import {
  CORE_CHARACTER_SECTIONS,
  createEmptyCharacterDesign,
  type CharacterDesign,
  type CharacterDesignSection,
  type CharacterDesignerMessage,
  type CharacterDesignerResult,
} from "@/lib/character-designer-types";
import styles from "./CharacterDesigner.module.css";

interface UiMessage extends CharacterDesignerMessage {
  id: string;
}

const STORAGE_KEY = "autocartoon.character-designer.draft.v1";
const MAX_SECTIONS = 12;
const MAX_SECTION_TITLE_LENGTH = 40;
const CORE_SECTION_KEYS = new Set<string>(
  CORE_CHARACTER_SECTIONS.map((section) => section.key)
);
const WELCOME_MESSAGE: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "어떤 캐릭터를 만들까요? 떠오른 장면이나 성격 한 가지만 말해도 설정 초안을 잡아드릴게요.",
};

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getRequestedSectionTitles(design: CharacterDesign): string[] {
  return design.sections
    .filter((section) => !CORE_SECTION_KEYS.has(section.key))
    .map((section) => section.title);
}

function getSectionContentText(section: CharacterDesignSection): string {
  const details = section.details.map(
    (detail) => `${detail.label}: ${detail.value}`
  );
  return [section.summary, ...details].filter(Boolean).join("\n");
}

function getSectionCopyText(section: CharacterDesignSection): string {
  return [section.title, getSectionContentText(section)]
    .filter(Boolean)
    .join("\n");
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Clipboard API timed out")),
            750
          );
        }),
      ]);
      return;
    } catch {
      // Fall through to the selection-based fallback for restricted browsers.
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드 복사에 실패했습니다.");
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
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [copiedSectionKey, setCopiedSectionKey] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [copiedSystemPrompt, setCopiedSystemPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sectionTitleInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptCopyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const requestedSectionTitles = getRequestedSectionTitles(design);
  const systemPrompt = buildCharacterDesignerSystemPrompt(
    requestedSectionTitles
  );

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

  useEffect(() => {
    if (addingSection) sectionTitleInputRef.current?.focus();
  }, [addingSection]);

  useEffect(() => {
    if (!showSystemPrompt) return;
    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShowSystemPrompt(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showSystemPrompt]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      if (promptCopyResetTimerRef.current) {
        clearTimeout(promptCopyResetTimerRef.current);
      }
    },
    []
  );

  const resetDraft = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setDesign(createEmptyCharacterDesign());
    setNextQuestions([]);
    setInput("");
    setError(null);
    setAddingSection(false);
    setNewSectionTitle("");
    setSectionFormError(null);
    setCopiedSectionKey(null);
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
    const requestedSections = getRequestedSectionTitles(design);

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
          requestedSections,
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

  const openSectionForm = () => {
    if (design.sections.length >= MAX_SECTIONS) {
      setSectionFormError(`항목은 최대 ${MAX_SECTIONS}개까지 추가할 수 있습니다.`);
      return;
    }
    setSectionFormError(null);
    setAddingSection(true);
  };

  const closeSectionForm = () => {
    setAddingSection(false);
    setNewSectionTitle("");
    setSectionFormError(null);
  };

  const addCustomSection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newSectionTitle.replace(/\s+/g, " ").trim();
    if (!title) {
      setSectionFormError("항목 제목을 입력해주세요.");
      return;
    }
    if (design.sections.length >= MAX_SECTIONS) {
      setSectionFormError(`항목은 최대 ${MAX_SECTIONS}개까지 추가할 수 있습니다.`);
      return;
    }
    if (
      design.sections.some(
        (section) =>
          section.title.toLocaleLowerCase("ko-KR") ===
          title.toLocaleLowerCase("ko-KR")
      )
    ) {
      setSectionFormError("이미 같은 제목의 항목이 있습니다.");
      return;
    }

    setDesign((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          key: `custom-${Date.now().toString(36)}`,
          title,
          summary: "다음 대화에서 이 항목의 설정을 구체화합니다.",
          details: [],
        },
      ],
    }));
    setInput((current) =>
      current || `"${title}" 항목을 캐릭터에 맞게 구체화해줘.`
    );
    closeSectionForm();
    inputRef.current?.focus();
  };

  const removeCustomSection = (sectionKey: string) => {
    setDesign((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.key !== sectionKey),
    }));
    setCopiedSectionKey((current) =>
      current === sectionKey ? null : current
    );
  };

  const copySection = async (section: CharacterDesignSection) => {
    try {
      await writeClipboard(getSectionCopyText(section));
      setCopiedSectionKey(section.key);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => {
        setCopiedSectionKey((current) =>
          current === section.key ? null : current
        );
      }, 1600);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "클립보드 복사에 실패했습니다."
      );
    }
  };

  const copySystemPrompt = async () => {
    try {
      await writeClipboard(systemPrompt);
      setCopiedSystemPrompt(true);
      if (promptCopyResetTimerRef.current) {
        clearTimeout(promptCopyResetTimerRef.current);
      }
      promptCopyResetTimerRef.current = setTimeout(() => {
        setCopiedSystemPrompt(false);
      }, 1600);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "클립보드 복사에 실패했습니다."
      );
    }
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
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.promptButton}
              onClick={() => setShowSystemPrompt(true)}
            >
              <LuFileText size={15} aria-hidden="true" />
              <span>시스템 프롬프트 보기</span>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={resetDraft}
              title="새 설정 시작"
              aria-label="새 설정 시작"
            >
              <LuRotateCcw size={17} />
            </button>
          </div>
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
          <div className={styles.settingsActions}>
            <button
              type="button"
              className={styles.addSectionButton}
              onClick={openSectionForm}
              disabled={design.sections.length >= MAX_SECTIONS}
              title={
                design.sections.length >= MAX_SECTIONS
                  ? `최대 ${MAX_SECTIONS}개까지 추가할 수 있습니다`
                  : "새 설정 항목 추가"
              }
            >
              <LuPlus size={15} aria-hidden="true" />
              <span>새 항목 추가하기</span>
            </button>
            <span className={styles.sectionCount}>
              {design.sections.length}개 항목
            </span>
          </div>
        </header>

        {addingSection && (
          <form className={styles.addSectionForm} onSubmit={addCustomSection}>
            <div className={styles.addSectionInputRow}>
              <input
                ref={sectionTitleInputRef}
                className={styles.addSectionInput}
                value={newSectionTitle}
                onChange={(event) => {
                  setNewSectionTitle(event.target.value);
                  setSectionFormError(null);
                }}
                maxLength={MAX_SECTION_TITLE_LENGTH}
                placeholder="예: 가치관, 관계, 목표"
                aria-label="새 항목 제목"
                aria-invalid={Boolean(sectionFormError)}
              />
              <button
                type="submit"
                className={styles.confirmSectionButton}
                title="항목 추가"
                aria-label="항목 추가"
              >
                <LuCheck size={17} />
              </button>
              <button
                type="button"
                className={styles.cancelSectionButton}
                onClick={closeSectionForm}
                title="취소"
                aria-label="취소"
              >
                <LuX size={17} />
              </button>
            </div>
            <div className={styles.addSectionMeta}>
              <span>추가한 제목은 다음 AI 설계 요청에 반드시 포함됩니다.</span>
              <span>{newSectionTitle.length}/{MAX_SECTION_TITLE_LENGTH}</span>
            </div>
            {sectionFormError && (
              <p className={styles.addSectionError} role="alert">
                {sectionFormError}
              </p>
            )}
          </form>
        )}

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
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className={styles.sectionTitle}>{section.title}</h3>
                </div>
                <div className={styles.sectionButtons}>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => void copySection(section)}
                    title={`${section.title} 내용 복사`}
                    aria-label={`${section.title} 내용 복사`}
                  >
                    {copiedSectionKey === section.key ? (
                      <LuCheck size={13} aria-hidden="true" />
                    ) : (
                      <LuCopy size={13} aria-hidden="true" />
                    )}
                    <span>
                      {copiedSectionKey === section.key ? "복사됨" : "복사"}
                    </span>
                  </button>
                  {!CORE_SECTION_KEYS.has(section.key) && (
                    <button
                      type="button"
                      className={styles.removeSectionButton}
                      onClick={() => removeCustomSection(section.key)}
                      title={`${section.title} 항목 삭제`}
                      aria-label={`${section.title} 항목 삭제`}
                    >
                      <LuTrash2 size={13} />
                    </button>
                  )}
                </div>
              </header>
              <p className={styles.sectionText}>
                {getSectionContentText(section)}
              </p>
            </article>
          ))}
        </div>
      </div>

      {showSystemPrompt && (
        <div
          className={styles.promptOverlay}
          onClick={() => setShowSystemPrompt(false)}
        >
          <section
            className={styles.promptDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="system-prompt-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.promptDialogHeader}>
              <div>
                <span className={styles.promptEyebrow}>Gemini systemInstruction</span>
                <h2 id="system-prompt-title">시스템 프롬프트</h2>
              </div>
              <button
                type="button"
                className={styles.promptCloseButton}
                onClick={() => setShowSystemPrompt(false)}
                title="닫기"
                aria-label="시스템 프롬프트 닫기"
                autoFocus
              >
                <LuX size={18} />
              </button>
            </header>
            <div className={styles.promptDialogBody}>
              <pre className={styles.promptText}>{systemPrompt}</pre>
            </div>
            <footer className={styles.promptDialogFooter}>
              <span>{systemPrompt.length.toLocaleString()}자</span>
              <button
                type="button"
                className={styles.promptCopyButton}
                onClick={() => void copySystemPrompt()}
              >
                {copiedSystemPrompt ? (
                  <LuCheck size={15} aria-hidden="true" />
                ) : (
                  <LuCopy size={15} aria-hidden="true" />
                )}
                <span>{copiedSystemPrompt ? "복사됨" : "전체 복사"}</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
