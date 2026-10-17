"use client";

// First Letters: "T L i m s, I s n w." (text.firstLetters). Say the verse from the letters; tap a
// letter to reveal its word (a peek, penalized like Progressive Hide).

import { useState } from "react";
import type { VerseKey } from "@/db/types";
import { firstLetterOf, tokenize } from "@/lib/text";
import { ActionBar, Button, cx, Icon } from "@/components/ui";
import { peekAccuracy } from "./helpers";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export interface FirstLettersProps {
  verses: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy) => void;
}

export function FirstLetters({ verses, onComplete }: FirstLettersProps) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [peeks, setPeeks] = useState<Record<VerseKey, number>>({});
  const totalPeeks = Object.values(peeks).reduce((a, b) => a + b, 0);

  const reveal = (key: VerseKey, ti: number) => {
    const id = `${key}#${ti}`;
    if (shown.has(id)) return;
    setShown(new Set([...shown, id]));
    setPeeks({ ...peeks, [key]: (peeks[key] ?? 0) + 1 });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3 font-semibold">
        <span>Say each word from its first letter.</span>
        <span className="inline-flex items-center gap-1 text-muted">
          <Icon name="eye" size={20} />
          {totalPeeks}
        </span>
      </p>
      <div className="reading flex flex-col gap-3">
        {verses.map((v) => (
          <p key={v.key} className="leading-[3rem]">
            <span className="mr-1.5 font-sans text-[14px] font-bold text-muted">{v.label}</span>
            {tokenize(v.text).map((t, ti) => {
              if (!t.core) return <span key={ti}>{t.display} </span>;
              const isShown = shown.has(`${v.key}#${ti}`);
              return (
                <span key={ti}>
                  <button
                    type="button"
                    onClick={() => reveal(v.key, ti)}
                    aria-label={isShown ? t.core : `${firstLetterOf(t)}, tap to show the word`}
                    className={cx(
                      "inline-flex min-h-12 min-w-9 items-center justify-center rounded-md px-1 align-middle",
                      isShown && "text-muted underline decoration-dotted underline-offset-4",
                    )}
                  >
                    {isShown ? t.display : firstLetterOf(t)}
                  </button>{" "}
                </span>
              );
            })}
          </p>
        ))}
      </div>
      <ActionBar label="First letters controls">
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
      </ActionBar>
    </div>
  );
}
