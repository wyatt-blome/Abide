"use client";

// Current time for render, refreshed every minute (stable between renders, so memoized queues
// don't rebuild on every render). 0 during prerender.

import { useSyncExternalStore } from "react";

const TICK_MS = 60_000;
let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      current = Date.now();
      subs.forEach((f) => f());
    }, TICK_MS);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  const t = Date.now();
  if (!current || t - current >= TICK_MS) current = t;
  return current;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
