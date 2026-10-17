"use client";

// Progressive Hide: 20% → 40% → … → 100% of the words hidden (same words stay hidden as more are
// added: seeded.hiddenIndices with seed hashSeed(verse key)). Say the verse; tap a hidden word to
// peek. Peeks are counted and penalized (scoring.score(..., peeks)).

import { useState } from "react";
import type { VerseKey } from "@/db/types";
import { hashSeed, hiddenIndices } from "@/lib/seeded";
import { tokenize } from "@/lib/text";
import { ActionBar, Button, cx, Icon } from "@/components/ui";
import { peekAccuracy } from "./helpers";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export const HIDE_LEVELS = [0.2, 0.4, 0.6, 0.8, 1];

export interface ProgressiveHideProps {
  verses: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy) => void;
}

export function ProgressiveHide({ verses, onComplete }: ProgressiveHideProps) {
  const [level, setLevel] = useState(0);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [peeks, setPeeks] = useState<Record<VerseKey, number>>({});
  const frac = HIDE_LEVELS[level];
  const last = level === HIDE_LEVELS.length - 1;
  const totalPeeks = Object.values(peeks).reduce((a, b) => a + b, 0);

  const changeLevel = (n: number) => {
    setLevel(n);
    setShown(new Set());
  };

  const peek = (key: VerseKey, wi: number) => {
    const id = `${key}#${wi}`;
    if (shown.has(id)) return;
    setShown(new Set([...shown, id]));
    setPeeks({ ...peeks, [key]: (peeks[key] ?? 0) + 1 });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3 font-semibold">
        <span>{Math.round(frac * 100)}% hidden</span>
        <span className="inline-flex items-center gap-1 text-muted">
          <Icon name="eye" size={20} />
          {totalPeeks} peek{totalPeeks === 1 ? "" : "s"}
        </span>
      </p>
      <p className="text-muted">Say it out loud. Tap a hidden word to peek.</p>
      <div className="reading flex flex-col gap-3">
        {verses.map((v) => {
          const toks = tokenize(v.text);
          const wordIdx: number[] = [];
          let n = 0;
          for (const t of toks) wordIdx.push(t.core ? n++ : -1);
          const hidden = new Set(hiddenIndices(n, frac, hashSeed(v.key)));
          return (
            <p key={v.key}>
              <span className="mr-1.5 font-sans text-[14px] font-bold text-muted">{v.label}</span>
              {toks.map((t, ti) => {
                const wi = wordIdx[ti];
                if (wi < 0 || !hidden.has(wi)) return <span key={ti}>{t.display} </span>;
                const isShown = shown.has(`${v.key}#${wi}`);
                return (
                  <span key={ti}>
                    {t.lead}
                    <button
                      type="button"
                      onClick={() => peek(v.key, wi)}
                      aria-label={isShown ? `Shown: ${t.core}` : "Hidden word. Tap to peek"}
                      className={cx(
                        "inline-flex min-h-12 items-center rounded-md px-1 align-middle",
                        isShown ? "text-muted underline decoration-dotted underline-offset-4" : "bg-surface-strong",
                      )}
                      style={isShown ? undefined : { minWidth: `${Math.max(2, t.core.length)}ch` }}
                    >
                      {isShown ? t.core : <span aria-hidden="true">&nbsp;</span>}
                    </button>
                    {t.trail}{" "}
                  </span>
                );
              })}
            </p>
          );
        })}
      </div>
      <ActionBar label="Hide controls">
        <Button icon="minus" disabled={level === 0} onClick={() => changeLevel(level - 1)}>
          Less
        </Button>
        {last ? (
          <Button
            variant="primary"
            icon="check"
            onClick={() => {
              const out: PerVerseAccuracy = {};
              for (const v of verses) out[v.key] = peekAccuracy(v.text, peeks[v.key] ?? 0);
              onComplete(out);
            }}
          >
            I said it
          </Button>
        ) : (
          <Button variant="primary" icon="eyeOff" onClick={() => changeLevel(level + 1)}>
            Hide more
          </Button>
        )}
      </ActionBar>
    </div>
  );
}
