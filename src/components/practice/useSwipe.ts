"use client";

// Horizontal swipe detection (touch). Returns props to spread on the swipe area.
// Swipe left → onNext, swipe right → onPrev. Vertical scrolling is left alone.

import { useRef, type TouchEvent } from "react";

const MIN_DX = 60;
const MAX_DY = 50;

export function useSwipe(onPrev?: () => void, onNext?: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > MAX_DY) return;
      if (dx < 0) onNext?.();
      else onPrev?.();
    },
  };
}
