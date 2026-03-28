"use client";

import { useRef, useEffect, useCallback } from "react";
import styles from "./PromptInput.module.css";

interface CharTag {
  id: string;
  name: string;
}

interface Props {
  tags: CharTag[];
  text: string;
  onTextChange: (text: string) => void;
  onTagRemove: (id: string) => void;
  placeholder?: string;
}

const TAG_ATTR = "data-char-tag-id";

export default function PromptInput({ tags, text, onTextChange, onTagRemove, placeholder }: Props) {
  const editRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const prevTagIds = useRef<string[]>([]);

  // 태그 HTML 생성
  const buildTagHtml = (tag: CharTag) =>
    `<span class="${styles.tag}" ${TAG_ATTR}="${tag.id}" contenteditable="false">${tag.name}<button class="${styles.tagX}" ${TAG_ATTR}="${tag.id}">×</button></span>`;

  // 현재 editable에서 순수 텍스트만 추출
  const extractText = useCallback(() => {
    if (!editRef.current) return "";
    const clone = editRef.current.cloneNode(true) as HTMLElement;
    // 태그 span 제거
    clone.querySelectorAll(`[${TAG_ATTR}]`).forEach((el) => {
      if (el.tagName === "SPAN") el.remove();
    });
    return clone.textContent?.trim() ?? "";
  }, []);

  // 태그 변경 시 DOM 동기화
  useEffect(() => {
    if (!editRef.current) return;
    const el = editRef.current;
    const prevIds = prevTagIds.current;
    const currIds = tags.map((t) => t.id);

    // 추가된 태그
    const added = tags.filter((t) => !prevIds.includes(t.id));
    // 제거된 태그
    const removed = prevIds.filter((id) => !currIds.includes(id));

    // 제거
    removed.forEach((id) => {
      const span = el.querySelector(`span[${TAG_ATTR}="${id}"]`);
      if (span) span.remove();
    });

    // 추가: 현재 커서 위치 또는 끝에 삽입
    added.forEach((tag) => {
      const html = buildTagHtml(tag);
      const temp = document.createElement("span");
      temp.innerHTML = html;
      const tagEl = temp.firstElementChild!;

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.insertNode(tagEl);
        // 커서를 태그 뒤로
        range.setStartAfter(tagEl);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // 커서가 없으면 맨 앞에 삽입
        el.insertBefore(tagEl, el.firstChild);
        // 태그 뒤에 공백 추가
        const space = document.createTextNode(" ");
        tagEl.after(space);
      }
    });

    prevTagIds.current = currIds;
  }, [tags]);

  // 초기 렌더: 텍스트 + 태그 복원
  useEffect(() => {
    if (!editRef.current) return;
    const el = editRef.current;
    if (el.innerHTML === "" || el.innerHTML === "<br>") {
      let html = "";
      tags.forEach((t) => {
        html += buildTagHtml(t) + " ";
      });
      html += text;
      el.innerHTML = html || "";
      prevTagIds.current = tags.map((t) => t.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    const newText = extractText();
    onTextChange(newText);
  }, [extractText, onTextChange]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const tagId = target.getAttribute(TAG_ATTR);
    if (tagId && target.tagName === "BUTTON") {
      e.preventDefault();
      e.stopPropagation();
      onTagRemove(tagId);
    }
  }, [onTagRemove]);

  // 백스페이스로 태그 삭제 시 처리
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      const node = range.startContainer;
      const offset = range.startOffset;

      // 텍스트 노드의 시작에서 백스페이스 → 앞의 태그 삭제
      if (node.nodeType === Node.TEXT_NODE && offset === 0) {
        const prev = node.previousSibling as HTMLElement | null;
        if (prev?.hasAttribute?.(TAG_ATTR)) {
          e.preventDefault();
          const tagId = prev.getAttribute(TAG_ATTR)!;
          onTagRemove(tagId);
        }
      }
      // 요소 노드에서 바로 앞이 태그
      if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
        const prevChild = node.childNodes[offset - 1] as HTMLElement | null;
        if (prevChild?.hasAttribute?.(TAG_ATTR)) {
          e.preventDefault();
          const tagId = prevChild.getAttribute(TAG_ATTR)!;
          onTagRemove(tagId);
        }
      }
    }
    // Enter 방지 (줄바꿈 허용하려면 제거)
  }, [onTagRemove]);

  const showPlaceholder = tags.length === 0 && !text;

  return (
    <div className={styles.container}>
      <div
        ref={editRef}
        className={`${styles.editable} ${showPlaceholder ? styles.empty : ""}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
        data-placeholder={placeholder ?? "이곳에 프롬프트를 입력하세요"}
      />
    </div>
  );
}
