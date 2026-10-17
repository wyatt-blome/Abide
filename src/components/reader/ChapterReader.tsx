"use client";

// Chapter / portion reader.
// - Text from lib/bible.ts (BSB/WEB/KJV) or lib/esv.ts (ESV, user's key). Empty slots show
//   "(no text in BSB)" etc.
// - BSB section headings (s1/s2/ms) are shown in their position for every translation, since all
//   bundled translations sit on the BSB verse grid; Psalm superscriptions ("d") only with BSB text
//   (they are BSB wording; KJV keeps its own inside verse 1). Attribution in the footer.
// - Tap a verse → actions. Press and hold a verse, then tap another → a range.
// - Tap a heading → Sources for that heading's section.
// - Swipe left/right (chapter mode) → next/previous chapter.

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type TouchEvent } from "react";
import { MemorizeThisSheet } from "@/components/memorize/MemorizeThisSheet";
import { AddLinkSheet } from "@/components/library/AddLinkSheet";
import { AddNoteSheet } from "@/components/library/AddNoteSheet";
import { SourcesSheet } from "@/components/sources/SourcesSheet";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, cx, haptic, Icon, PageHeader } from "@/components/ui";
import type { BsbHeading, ReadingDay, TranslationId, VerseRange, VerseRef } from "@/db/types";
import { headingsInRange, type RangeVerse } from "@/lib/bible";
import { chapterRangeOf, type BibleMeta } from "@/lib/meta";
import { setPortionDone } from "@/lib/readingPlanStore";
import { formatRange, formatRef, toKey } from "@/lib/refs";
import { BOOK_BY_CODE } from "@/lib/books";
import { CheckBox } from "./CheckBox";
import { scrollBehavior, useReducedMotion } from "./hooks";
import { ListenButton } from "./ListenButton";
import { loadPassage, noTextLabel, type LoadedPassage } from "./passage";
import { PickerSheet, TRANSLATION_NAME } from "./PickerSheet";
import { adjacentChapter, orderedRange, refInRange, sectionRange, type ChapterPos } from "./readerNav";
import { portionReaderHref } from "./TodayReading";
import { useSpeech, wordTokens, type SpeechItem } from "./useSpeech";
import { VerseActionSheet, type VerseAction } from "./VerseActionSheet";

export type ReaderMode = { kind: "chapter"; pos: ChapterPos } | { kind: "portion"; day: ReadingDay; index: number };

export interface ChapterReaderProps {
  meta: BibleMeta;
  headings: BsbHeading[];
  mode: ReaderMode;
  translation: TranslationId;
  translations: TranslationId[];
  focusVerse?: number;
  autoListen?: boolean;
  onNavigate: (pos: ChapterPos, opts?: { listen?: boolean }) => void;
  onTranslation: (t: TranslationId) => void;
  onAutoListenDone?: () => void;
}

type SubSheet = { kind: "memorize" | "sources" | "note" | "link"; range: VerseRange } | null;

const LONG_PRESS_MS = 500;
const SWIPE_MIN_PX = 70;
const keyOf = (r: VerseRef) => toKey(r);
const rangeSig = (r: VerseRange) => `${toKey(r.start)}-${toKey(r.end)}`;

export function ChapterReader(props: ChapterReaderProps) {
  const { meta, headings, mode, translation, translations, focusVerse, autoListen, onNavigate, onTranslation, onAutoListenDone } = props;
  const { settings } = useSettings();
  const reduced = useReducedMotion();
  const speech = useSpeech();

  const portion = mode.kind === "portion" ? mode.day.portions[mode.index] : null;
  const range: VerseRange = mode.kind === "chapter" ? chapterRangeOf(meta, mode.pos.book, mode.pos.chapter) : portion!.range;
  const sig = `${translation}|${rangeSig(range)}`;
  const title = formatRange(range, meta);

  // ---------------- text
  const [loaded, setLoaded] = useState<{ sig: string; passage: LoadedPassage } | null>(null);
  const [failed, setFailed] = useState<{ sig: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const esv = useMemo(() => ({ esvEnabled: settings.esvEnabled, esvKey: settings.esvKey }), [settings.esvEnabled, settings.esvKey]);
  useEffect(() => {
    let cancelled = false;
    loadPassage(translation, range, esv)
      .then((p) => {
        if (!cancelled) setLoaded({ sig, passage: p });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error && e.name === "EsvError" ? e.message : "Couldn't load this chapter. Check your connection.";
        setFailed({ sig, message });
      });
    return () => {
      cancelled = true;
    };
    // `sig` stands for translation + range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, esv, retry]);
  const passage = loaded?.sig === sig ? loaded.passage : null;
  const error = !passage && failed?.sig === sig ? failed.message : null;
  const shownTranslation = passage?.translation ?? translation;

  // ---------------- headings
  const shownHeadings = useMemo(
    () => headingsInRange(headings, range).filter((h) => h.level !== "d" || shownTranslation === "BSB"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [headings, sig, shownTranslation],
  );
  const headingsAt = useMemo(() => {
    const m = new Map<string, BsbHeading[]>();
    for (const h of shownHeadings) {
      const k = `${h.book}.${h.chapter}.${h.verse}`;
      m.set(k, [...(m.get(k) ?? []), h]);
    }
    return m;
  }, [shownHeadings]);

  // ---------------- selection & sheets
  const [anchor, setAnchor] = useState<VerseRef | null>(null);
  const [actionRange, setActionRange] = useState<VerseRange | null>(null);
  const [sub, setSub] = useState<SubSheet>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) {
    // New chapter/translation: drop any half-made selection.
    setPrevSig(sig);
    setAnchor(null);
    setActionRange(null);
  }
  const selection = actionRange ?? sub?.range ?? null;

  const anchorRef = useRef(anchor);
  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);
  const onVerseTap = useCallback((ref: VerseRef) => {
    const a = anchorRef.current;
    if (a) {
      setAnchor(null);
      setActionRange(orderedRange(a, ref));
    } else setActionRange({ start: ref, end: ref });
  }, []);
  const onVerseLongPress = useCallback((ref: VerseRef) => {
    haptic("tap");
    setActionRange(null);
    setAnchor(ref);
  }, []);

  // ---------------- listening
  const items: SpeechItem[] = useMemo(
    () => (passage ? passage.verses.filter((v) => v.text).map((v) => ({ key: v.key, text: v.text, label: formatRef(v.ref) })) : []),
    [passage],
  );
  const next = mode.kind === "chapter" ? adjacentChapter(meta, mode.pos, 1) : null;
  const prev = mode.kind === "chapter" ? adjacentChapter(meta, mode.pos, -1) : null;
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });

  const startListen = (fromKey?: string) => {
    if (!items.length) return;
    const at = fromKey ? Math.max(0, items.findIndex((it) => it.key === fromKey)) : 0;
    speech.start(items, {
      title,
      startAt: at,
      onFinish: (result) => {
        if (result === "end" && mode.kind === "chapter" && nextRef.current) onNavigate(nextRef.current, { listen: true });
      },
    });
  };

  const autoDone = useRef<string | null>(null);
  useEffect(() => {
    if (!autoListen || !passage || autoDone.current === sig) return;
    autoDone.current = sig;
    startListen();
    onAutoListenDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen, passage, sig]);

  // ---------------- scrolling
  const textRef = useRef<HTMLDivElement>(null);
  const speakingKey = speech.current?.key ?? null;
  useEffect(() => {
    if (!speakingKey) return;
    textRef.current?.querySelector(`[data-key="${speakingKey}"]`)?.scrollIntoView({ block: "center", behavior: scrollBehavior(reduced) });
  }, [speakingKey, reduced]);
  useEffect(() => {
    if (!passage || !focusVerse || mode.kind !== "chapter") return;
    const k = `${mode.pos.book}.${mode.pos.chapter}.${focusVerse}`;
    textRef.current?.querySelector(`[data-key="${k}"]`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage, focusVerse]);

  // ---------------- swipe between chapters
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const go = (pos: ChapterPos | null) => {
    if (!pos) return;
    speech.stop();
    onNavigate(pos);
  };
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || mode.kind !== "chapter" || anchor) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - s.t < 800) go(dx < 0 ? next : prev);
  };

  // ---------------- actions
  const onAction = (action: VerseAction, r: VerseRange) => {
    setActionRange(null);
    if (action === "selectFrom") return setAnchor(r.start);
    if (action === "listenFrom") return startListen(keyOf(r.start));
    setSub({ kind: action, range: r });
  };

  const onHeadingTap = (h: BsbHeading) => setSub({ kind: "sources", range: sectionRange(meta, headings, h) });

  // ---------------- render
  const multiChapter = range.start.book !== range.end.book || range.start.chapter !== range.end.chapter;
  const nextPortion =
    mode.kind === "portion" && mode.index + 1 < mode.day.portions.length ? mode.index + 1 : null;
  const shortTitle = mode.kind === "chapter" ? `${BOOK_BY_CODE[mode.pos.book]?.name ?? mode.pos.book} ${mode.pos.chapter}` : title;

  return (
    <>
      <PageHeader
        title={title}
        backHref="/read"
        backLabel="Back to Read"
        trailing={
          <button
            type="button"
            className="tap rounded-xl px-2 font-bold text-muted"
            aria-label={`Translation ${shownTranslation}. Change`}
            onClick={() => setPickerOpen(true)}
          >
            {shownTranslation}
          </button>
        }
      />

      {error ? (
        <div className="my-6 flex flex-col gap-3" role="alert">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <Icon name="cross" size={22} />
            {error}
          </p>
          <Button icon="refresh" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
          {translation === "ESV" ? <Button onClick={() => onTranslation("BSB")}>Read the BSB instead</Button> : null}
        </div>
      ) : null}

      {!passage && !error ? <p className="my-6 text-muted">Loading…</p> : null}

      {passage ? (
        <div
          ref={textRef}
          className="reading mt-2 flex flex-col"
          lang="en"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {passage.verses.map((v, i) => {
            const k = v.key;
            const hs = headingsAt.get(k);
            const chapterStart = multiChapter && (i === 0 || v.ref.verse === 1);
            return (
              <div key={k}>
                {chapterStart ? (
                  <h2 className="mt-4 mb-1 font-sans text-[17px] font-bold uppercase tracking-wide text-muted">
                    {formatRange(chapterRangeOf(meta, v.ref.book, v.ref.chapter), meta)}
                  </h2>
                ) : null}
                {hs?.map((h, j) => (
                  <HeadingButton key={`${k}-h${j}`} heading={h} onTap={onHeadingTap} />
                ))}
                <VerseRow
                  verse={v}
                  translation={shownTranslation}
                  selected={!!(anchor && keyOf(anchor) === k) || !!(selection && refInRange(selection, v.ref))}
                  speaking={speakingKey === k}
                  word={speakingKey === k ? speech.word : -1}
                  onTap={onVerseTap}
                  onLongPress={onVerseLongPress}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {passage ? (
        <footer className="mt-6 flex flex-col gap-1 text-[14px] text-muted">
          <p>Text: {TRANSLATION_NAME[shownTranslation]}</p>
          {passage.notice ? <p>{passage.notice}</p> : null}
          {shownHeadings.length ? <p>Headings: Berean Standard Bible</p> : null}
          {mode.kind === "chapter" ? <p>Swipe left or right for the next or previous chapter.</p> : null}
        </footer>
      ) : null}

      {mode.kind === "portion" && nextPortion !== null ? (
        <Link href={portionReaderHref(mode.day.id, nextPortion)} className="tap mt-4 inline-flex items-center gap-2 font-bold underline">
          Next: {formatRange(mode.day.portions[nextPortion].range, meta)}
          <Icon name="chevronRight" size={20} />
        </Link>
      ) : null}

      <ActionBar label="Reader">
        {anchor ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 font-semibold" role="status">
              From {formatRef(anchor)}. Tap the last verse.
            </p>
            <Button icon="close" onClick={() => setAnchor(null)}>
              Cancel
            </Button>
          </div>
        ) : mode.kind === "portion" && portion ? (
          <div className="flex items-center gap-2">
            <ListenButton speech={speech} onListen={() => startListen()} disabled={!items.length} className="min-w-0! flex-1" />
            {speech.state !== "idle" ? <Button iconOnly icon="stop" label="Stop" onClick={speech.stop} /> : null}
            <CheckBox
              checked={portion.done}
              onChange={(c) => void setPortionDone(mode.day.id, mode.index, c)}
              label="Mark read"
              showLabel
              className="bordered flex-1 bg-surface px-2"
            />
          </div>
        ) : (
          <div className="flex min-w-0 items-stretch gap-2">
            <Button
              iconOnly
              icon="chevronLeft"
              label={prev ? `Previous chapter: ${BOOK_BY_CODE[prev.book]?.name ?? prev.book} ${prev.chapter}` : "Previous chapter"}
              disabled={!prev}
              onClick={() => go(prev)}
            />
            <ListenButton speech={speech} onListen={() => startListen()} disabled={!items.length} className="min-w-0! flex-1 px-2" />
            {speech.state !== "idle" ? (
              <Button iconOnly icon="stop" label="Stop" onClick={speech.stop} />
            ) : (
              <Button className="min-w-0! flex-1 px-2" onClick={() => setPickerOpen(true)} aria-label={`${shortTitle}. Choose book and chapter`}>
                <span className="truncate">{shortTitle}</span>
              </Button>
            )}
            <Button
              iconOnly
              icon="chevronRight"
              label={next ? `Next chapter: ${BOOK_BY_CODE[next.book]?.name ?? next.book} ${next.chapter}` : "Next chapter"}
              disabled={!next}
              onClick={() => go(next)}
            />
          </div>
        )}
      </ActionBar>

      <PickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        meta={meta}
        current={mode.kind === "chapter" ? mode.pos : null}
        translation={shownTranslation}
        translations={translations}
        onTranslation={(t) => {
          speech.stop();
          onTranslation(t);
        }}
        onPick={mode.kind === "chapter" ? (pos) => go(pos) : undefined}
      />

      <VerseActionSheet
        range={actionRange && !anchor ? actionRange : null}
        meta={meta}
        onClose={() => setActionRange(null)}
        onAction={onAction}
        canSelectRange
        canListen={items.length > 0 && speech.supported}
      />

      {sub?.kind === "memorize" ? <MemorizeThisSheet open onClose={() => setSub(null)} range={sub.range} /> : null}
      {sub?.kind === "sources" ? (
        <SourcesSheet open onClose={() => setSub(null)} range={sub.range} translation={shownTranslation} />
      ) : null}
      {sub?.kind === "note" ? <AddNoteSheet open onClose={() => setSub(null)} initialRanges={[sub.range]} /> : null}
      {sub?.kind === "link" ? <AddLinkSheet open onClose={() => setSub(null)} initialRanges={[sub.range]} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- heading

const HEADING_CLASS: Record<BsbHeading["level"], string> = {
  ms: "mt-6 text-[1.15em] font-bold uppercase tracking-wide",
  s1: "mt-5 text-[1.05em] font-bold",
  s2: "mt-3 text-[0.95em] font-semibold italic",
  d: "mt-2 text-[0.9em] italic",
};

function HeadingButton({ heading, onTap }: { heading: BsbHeading; onTap: (h: BsbHeading) => void }) {
  const Tag = heading.level === "ms" ? "h2" : "h3";
  return (
    <Tag className={cx("font-sans", HEADING_CLASS[heading.level])}>
      <button
        type="button"
        onClick={() => onTap(heading)}
        className="tap w-full rounded-lg px-2 text-left"
        aria-label={`${heading.text}. Sources for this section`}
      >
        {heading.text}
      </button>
    </Tag>
  );
}

// ---------------------------------------------------------------- verse

interface VerseRowProps {
  verse: RangeVerse;
  translation: TranslationId;
  selected: boolean;
  speaking: boolean;
  word: number;
  onTap: (ref: VerseRef) => void;
  onLongPress: (ref: VerseRef) => void;
}

const VerseRow = memo(function VerseRow({ verse, translation, selected, speaking, word, onTap, onLongPress }: VerseRowProps) {
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; fired: boolean } | null>(null);
  const clear = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    if (press.current) press.current.timer = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    clear();
    const p = { x: e.clientX, y: e.clientY, timer: null as ReturnType<typeof setTimeout> | null, fired: false };
    p.timer = setTimeout(() => {
      p.fired = true;
      p.timer = null;
      onLongPress(verse.ref);
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p?.timer && (Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10)) clear();
  };
  const onClick = () => {
    const fired = press.current?.fired;
    clear();
    press.current = null;
    if (fired) return;
    onTap(verse.ref);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTap(verse.ref);
    }
  };

  const empty = !verse.text;
  return (
    <div
      role="button"
      tabIndex={0}
      data-key={verse.key}
      aria-pressed={selected || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{ WebkitTouchCallout: "none" }}
      className={cx(
        "min-h-12 select-none rounded-lg border-l-4 border-transparent px-2 py-1",
        selected && "border-accent bg-surface-strong",
        speaking && "outline outline-[3px] outline-accent",
      )}
    >
      <sup className="mr-1 font-sans text-[0.65em] font-bold text-muted">{verse.ref.verse}</sup>
      {empty ? (
        <span className="italic text-muted">{noTextLabel(translation)}</span>
      ) : speaking ? (
        wordTokens(verse.text).map((t, i) =>
          t.word >= 0 && t.word === word ? (
            <span key={i} className="rounded bg-surface-strong underline decoration-[3px] underline-offset-4">
              {t.text}
            </span>
          ) : (
            <span key={i}>{t.text}</span>
          ),
        )
      ) : (
        verse.text
      )}
      {selected ? <span className="sr-only"> (selected)</span> : null}
    </div>
  );
});
