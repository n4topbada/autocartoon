"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

interface ResizablePanelOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  minContentWidth?: number;
}

export function useResizablePanelWidth({
  storageKey,
  defaultWidth,
  minWidth = 320,
  maxWidth = 680,
  minContentWidth = 360,
}: ResizablePanelOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [resizing, setResizing] = useState(false);
  const dragLeftRef = useRef(0);

  const clampWidth = useCallback((candidate: number) => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? maxWidth + minContentWidth;
    const responsiveMaximum = Math.max(minWidth, containerWidth - minContentWidth - 8);
    return Math.round(Math.max(minWidth, Math.min(maxWidth, responsiveMaximum, candidate)));
  }, [maxWidth, minContentWidth, minWidth]);

  const commitWidth = useCallback((candidate: number) => {
    const next = clampWidth(candidate);
    setPanelWidth(next);
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // Private browsing can disable storage; resizing still works for this session.
    }
  }, [clampWidth, storageKey]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) setPanelWidth(clampWidth(saved));
    } catch {
      // Keep the default width when storage is unavailable.
    }
  }, [clampWidth, storageKey]);

  useEffect(() => {
    const handleResize = () => setPanelWidth((current) => clampWidth(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampWidth]);

  const finishPointerResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    setResizing(false);
    commitWidth(event.clientX - dragLeftRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [commitWidth, resizing]);

  const cancelPointerResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    setResizing(false);
    commitWidth(panelWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [commitWidth, panelWidth, resizing]);

  const separatorProps = useMemo(() => ({
    role: "separator" as const,
    tabIndex: 0,
    "aria-orientation": "vertical" as const,
    "aria-valuemin": minWidth,
    "aria-valuemax": maxWidth,
    "aria-valuenow": panelWidth,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      dragLeftRef.current = containerRef.current?.getBoundingClientRect().left ?? 0;
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!resizing) return;
      setPanelWidth(clampWidth(event.clientX - dragLeftRef.current));
    },
    onPointerUp: finishPointerResize,
    onPointerCancel: cancelPointerResize,
    onDoubleClick: () => commitWidth(defaultWidth),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") commitWidth(panelWidth - 20);
      else if (event.key === "ArrowRight") commitWidth(panelWidth + 20);
      else if (event.key === "Home") commitWidth(minWidth);
      else if (event.key === "End") commitWidth(maxWidth);
      else return;
      event.preventDefault();
    },
  }), [cancelPointerResize, clampWidth, commitWidth, defaultWidth, finishPointerResize, maxWidth, minWidth, panelWidth, resizing]);

  return {
    containerRef,
    panelWidth,
    resizing,
    separatorProps,
    style: { "--controls-panel-width": `${panelWidth}px` } as CSSProperties,
  };
}
