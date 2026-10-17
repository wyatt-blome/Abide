"use client";

// /read/reader?book=PSA&chapter=23&t=BSB[&v=4][&listen=1]   chapter mode
// /read/reader?day=<readingDayId>&portion=<i>[&t=WEB]        one reading-plan portion + "Mark read"

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/db";
import type { TranslationId } from "@/db/types";
import { pickCurrentPlan } from "@/lib/readingPlanStore";
import { ChapterReader } from "./ChapterReader";
import { useBibleMeta, useHeadings } from "./hooks";
import { availableTranslations, effectiveTranslation } from "./passage";
import { validPos, type ChapterPos } from "./readerNav";

const LAST_KEY = "abide.reader.last";

function readLast(): ChapterPos | null {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ChapterPos>;
    return typeof v.book === "string" && typeof v.chapter === "number" ? { book: v.book, chapter: v.chapter } : null;
  } catch {
    return null;
  }
}

function saveLast(pos: ChapterPos) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export function readerHref(pos: ChapterPos, t?: TranslationId, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ book: pos.book, chapter: String(pos.chapter), ...(t ? { t } : {}), ...extra });
  return `/read/reader?${q.toString()}`;
}

export function ReaderScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { settings } = useSettings();
  const meta = useBibleMeta();
  const headings = useHeadings();
  const [last] = useState(readLast);

  const dayId = params.get("day");
  const portionIndex = Number(params.get("portion") ?? "0");
  const day = useLiveQuery(async () => (dayId ? (await db.readingDays.get(dayId)) ?? null : null), [dayId]);
  const plans = useLiveQuery(() => db.readingPlans.toArray(), []);
  const plan = pickCurrentPlan(plans);

  const tParam = params.get("t") as TranslationId | null;
  const esv = { esvEnabled: settings.esvEnabled, esvKey: settings.esvKey };
  const translation = effectiveTranslation(tParam ?? (dayId ? plan?.translation : undefined) ?? settings.translation, esv);
  const translations = availableTranslations(esv);

  const pos = meta.data
    ? validPos(meta.data, params.get("book"), Number(params.get("chapter") ?? "1")) ?? (last && validPos(meta.data, last.book, last.chapter)) ?? { book: "GEN", chapter: 1 }
    : null;
  const portionMode = !!dayId;

  useEffect(() => {
    if (pos && !portionMode) saveLast(pos);
  }, [pos?.book, pos?.chapter, portionMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (meta.error || headings.error) {
    return (
      <>
        <PageHeader title="Reader" backHref="/read" />
        <EmptyState title="Couldn't load the Bible" icon="info">
          {meta.error ?? headings.error}
        </EmptyState>
      </>
    );
  }
  if (!meta.data || !headings.data || !pos || (portionMode && day === undefined)) {
    return (
      <>
        <PageHeader title="Reader" backHref="/read" />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }

  if (portionMode && (!day || !day.portions[portionIndex])) {
    return (
      <>
        <PageHeader title="Reader" backHref="/read" />
        <EmptyState title="This reading is no longer in your plan" icon="book" />
      </>
    );
  }

  const navigate = (p: ChapterPos, opts?: { listen?: boolean }) => {
    router.replace(readerHref(p, translation, opts?.listen ? { listen: "1" } : {}), { scroll: true });
  };
  const setTranslation = (t: TranslationId) => {
    const q = new URLSearchParams(params.toString());
    q.set("t", t);
    q.delete("listen");
    router.replace(`/read/reader?${q.toString()}`, { scroll: false });
  };
  const clearListen = () => {
    const q = new URLSearchParams(params.toString());
    if (!q.has("listen")) return;
    q.delete("listen");
    router.replace(`/read/reader?${q.toString()}`, { scroll: false });
  };
  const v = Number(params.get("v") ?? "");

  return (
    <ChapterReader
      meta={meta.data}
      headings={headings.data}
      mode={portionMode && day ? { kind: "portion", day, index: portionIndex } : { kind: "chapter", pos }}
      translation={translation}
      translations={translations}
      focusVerse={Number.isFinite(v) && v > 0 ? v : undefined}
      autoListen={params.get("listen") === "1"}
      onAutoListenDone={clearListen}
      onNavigate={navigate}
      onTranslation={setTranslation}
    />
  );
}
