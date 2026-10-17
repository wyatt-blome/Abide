"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { BsbHeading } from "@/db/types";
import { loadHeadings, loadMeta } from "@/lib/bible";
import { todayISO, type ISODate } from "@/lib/isoDate";
import type { BibleMeta } from "@/lib/meta";

// ---------------- today (local calendar date; null during prerender/hydration)

function subscribeToday(cb: () => void): () => void {
  const onVis = () => cb();
  document.addEventListener("visibilitychange", onVis);
  const t = setInterval(cb, 60_000);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    clearInterval(t);
  };
}

export function useToday(): ISODate | null {
  return useSyncExternalStore(subscribeToday, () => todayISO(), () => null);
}

// ---------------- reduced motion

function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    () => false,
  );
}

export const scrollBehavior = (reduced: boolean): ScrollBehavior => (reduced ? "auto" : "smooth");

// ---------------- bible meta / headings

export interface Loaded<T> {
  data: T | null;
  error: string | null;
}

function useLoader<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, error: "Couldn't load the Bible data. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return state;
}

export function useBibleMeta(): Loaded<BibleMeta> {
  return useLoader(loadMeta);
}

export function useHeadings(): Loaded<BsbHeading[]> {
  return useLoader(loadHeadings);
}
