"use client";

// Type First Letters (main drill). For each word, type its first letter on the on-screen keyboard
// (or a physical keyboard). Case and punctuation are ignored; a number's letter is the first letter
// of its spoken form. Correct → the word appears with ✓; wrong → red flash, ✗ count and an error
// haptic; after 2 misses the word is revealed (✗). Hint reveals the current word (a peek).
// Accuracy per item = words right first try / words, minus the peek penalty.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PEEK_PENALTY } from "@/lib/scoring";
import { wordTokens, type Token } from "@/lib/text";
import { cx, haptic, Icon } from "@/components/ui";
import { expectedLetter } from "./helpers";
import { KEYBOARD_SPACER_CLASS, LetterKeyboard } from "./LetterKeyboard";

export interface TypeItem {
  id: string;
  /** Small label before the text ("v.3", "Heading 2"). */
  label: string;
  text: string;
  /** Group headings shown above this item (e.g. BSB headings in the Story drill). */
  headings?: string[];
}

export interface TypeItemResult { accuracy: number; firstTry: number; total: number; peeks: number; misses: number }

export interface TypeFirstResult {
  perItem: Record<string, TypeItemResult>;
  misses: number;
  peeks: number;
}

export interface TypeFirstProps {
  items: TypeItem[];
  onComplete: (result: TypeFirstResult) => void;
  /** Label above the headings group (e.g. "Heading: Berean Standard Bible"). */
  headingsCaption?: string;
  /** Misses before a word is revealed. Default 2. */
  maxMisses?: number;
}

export type WordStatus = "pending" | "first" | "late" | "revealed" | "peeked";

interface Word { item: number; token: Token; letter: string }

interface State { idx: number; status: WordStatus[]; misses: number; totalMisses: number; peeks: number; message: string }

type Action = { type: "key"; letter: string } | { type: "hint" };

function makeReducer(words: Word[], maxMisses: number) {
  return (s: State, a: Action): State => {
    if (s.idx >= words.length) return s;
    const w = words[s.idx];
    const status = s.status.slice();
    if (a.type === "hint") {
      status[s.idx] = "peeked";
      return { ...s, idx: s.idx + 1, status, misses: 0, peeks: s.peeks + 1, message: `Shown: ${w.token.core}` };
    }
    if (a.letter === w.letter) {
      status[s.idx] = s.misses === 0 ? "first" : "late";
      return { ...s, idx: s.idx + 1, status, misses: 0, message: `Correct: ${w.token.core}` };
    }
    const misses = s.misses + 1;
    if (misses >= maxMisses) {
      status[s.idx] = "revealed";
      return { ...s, idx: s.idx + 1, status, misses: 0, totalMisses: s.totalMisses + 1, message: `Missed. The word was ${w.token.core}` };
    }
    return { ...s, misses, totalMisses: s.totalMisses + 1, message: `Not ${a.letter.toUpperCase()}. Try again.` };
  };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

export function TypeFirst({ items, onComplete, headingsCaption, maxMisses = 2 }: TypeFirstProps) {
  const words = useMemo<Word[]>(
    () =>
      items.flatMap((it, item) =>
        wordTokens(it.text)
          .map((token) => ({ item, token, letter: expectedLetter(token.core) }))
          .filter((w) => w.letter),
      ),
    [items],
  );
  const reducer = useMemo(() => makeReducer(words, maxMisses), [words, maxMisses]);
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    idx: 0, status: words.map(() => "pending" as WordStatus), misses: 0, totalMisses: 0, peeks: 0, message: "",
  }));
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = state.idx >= words.length;
  const reported = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const press = useCallback(
    (letter: string) => {
      if (done) return;
      const w = words[state.idx];
      if (w && letter !== w.letter) {
        haptic("error");
        setFlashing(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashing(false), 450);
      }
      dispatch({ type: "key", letter });
    },
    [done, words, state.idx],
  );
  const hint = useCallback(() => {
    if (!done) dispatch({ type: "hint" });
  }, [done]);

  // Physical keyboard: letters type, "?" is the hint.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        hint();
        return;
      }
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        e.preventDefault();
        press(e.key.toLowerCase());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press, hint]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    const perItem: Record<string, TypeItemResult> = {};
    items.forEach((it, i) => {
      const ws = words.map((w, wi) => ({ w, st: state.status[wi] })).filter((x) => x.w.item === i);
      const total = ws.length;
      const firstTry = ws.filter((x) => x.st === "first").length;
      const peeks = ws.filter((x) => x.st === "peeked").length;
      const misses = ws.filter((x) => x.st === "revealed").length;
      const raw = total ? firstTry / total : 1;
      perItem[it.id] = { accuracy: Math.max(0, raw - PEEK_PENALTY * peeks), firstTry, total, peeks, misses };
    });
    onCompleteRef.current({ perItem, misses: state.totalMisses, peeks: state.peeks });
  }, [done, items, words, state]);

  const firstTry = state.status.filter((s) => s === "first").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[16px] font-semibold" aria-label="Score so far">
        <span className="inline-flex items-center gap-1 text-success">
          <Icon name="check" size={20} />
          <span>{firstTry} right</span>
        </span>
        <span className="inline-flex items-center gap-1 text-danger" data-testid="miss-count">
          <Icon name="cross" size={20} />
          <span>
            {state.totalMisses} miss{state.totalMisses === 1 ? "" : "es"}
          </span>
        </span>
        {state.peeks ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Icon name="lightbulb" size={20} />
            <span>
              {state.peeks} hint{state.peeks === 1 ? "" : "s"}
            </span>
          </span>
        ) : null}
        <span className="ml-auto text-muted tabular-nums">
          {Math.min(state.idx, words.length)}/{words.length}
        </span>
      </div>

      <div className="reading flex flex-col gap-3" data-testid="type-first-text">
        {items.map((it, ii) => (
          <div key={it.id}>
            {it.headings?.length ? (
              <div className="mb-1 mt-2 font-sans">
                {headingsCaption ? <p className="text-[13px] font-semibold text-muted">{headingsCaption}</p> : null}
                {it.headings.map((h, hi) => (
                  <p key={hi} className="text-[17px] font-bold">
                    {h}
                  </p>
                ))}
              </div>
            ) : null}
            <p>
              <span className="mr-1.5 font-sans text-[14px] font-bold text-muted">{it.label}</span>
              {words
                .map((w, i) => ({ w, i }))
                .filter(({ w }) => w.item === ii)
                .map(({ w, i }) => {
                  const st = state.status[i];
                  const current = i === state.idx;
                  return (
                    <WordView key={i} word={w} status={st} current={current} flashing={current && flashing} misses={current ? state.misses : 0} />
                  );
                })}
            </p>
          </div>
        ))}
      </div>

      <p className="sr-only" aria-live="assertive">
        {state.message}
      </p>
      <div aria-hidden="true" className={KEYBOARD_SPACER_CLASS} />
      <LetterKeyboard onKey={press} onHint={hint} disabled={done} />
    </div>
  );
}

function WordView({ word, status, current, flashing, misses }: { word: Word; status: WordStatus; current: boolean; flashing: boolean; misses: number }) {
  const t = word.token;
  if (status === "pending") {
    if (current) {
      return (
        <span
          data-word-status="current"
          className={cx(
            "mx-0.5 inline-flex min-w-10 items-center justify-center rounded-md px-1 align-middle font-sans text-[16px] font-bold",
            "[border-width:max(2px,var(--border-width))] border-solid",
            flashing ? "border-danger bg-danger text-danger-fg" : "border-focus bg-surface text-fg",
          )}
        >
          {flashing ? <Icon name="cross" size={18} label="Wrong letter" /> : misses ? `${misses}✗` : "?"}
        </span>
      );
    }
    return <span data-word-status="pending" aria-hidden="true" className="mx-0.5 inline-block h-[0.2em] w-8 rounded bg-surface-strong align-middle" />;
  }
  const ok = status === "first" || status === "late";
  return (
    <span data-word-status={status} className="mr-[0.3em] inline-flex items-baseline">
      <span
        className={cx(
          status === "first" && "text-success",
          !ok && "text-danger underline decoration-2 underline-offset-4",
        )}
      >
        {t.lead}
        {t.core}
        {t.trail}
      </span>
      <Icon
        name={ok ? "check" : status === "peeked" ? "lightbulb" : "cross"}
        size={14}
        className={cx("ml-0.5 self-start", ok ? (status === "first" ? "text-success" : "text-muted") : "text-danger")}
      />
      <span className="sr-only">
        {status === "first" ? "(right)" : status === "late" ? "(right after a miss)" : status === "peeked" ? "(hint)" : "(missed)"}
      </span>
    </span>
  );
}
