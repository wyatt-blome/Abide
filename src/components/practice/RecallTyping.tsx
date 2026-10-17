"use client";

// Full Recall Typing: type the whole passage from memory, then see the word-by-word diff.

import { useEffect, useId, useRef, useState } from "react";
import type { VerseKey } from "@/db/types";
import { ActionBar, Button, haptic } from "@/components/ui";
import { DiffView } from "./DiffView";
import { scoreVerses, type MultiScore } from "./helpers";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export interface RecallTypingProps {
  verses: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy) => void;
  /** Heading shown above the box (e.g. the reference in the Reference drill). */
  prompt?: string;
}

export function RecallTyping({ verses, onComplete, prompt }: RecallTypingProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<MultiScore | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [peeks, setPeeks] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const check = () => {
    // A peek counts against every verse shown.
    const perPeek: Record<VerseKey, number> = Object.fromEntries(verses.map((v) => [v.key, peeks]));
    const r = scoreVerses(verses, text, perPeek);
    if (r.matched < r.total) haptic("error");
    setResult(r);
  };

  const peek = () => {
    setPeeks((n) => n + 1);
    setPeeking(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeeking(false), 3000);
  };

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <DiffView
          ops={result.ops}
          matched={result.matched}
          total={result.total}
          verseStarts={verses.length > 1 ? result.verseStarts.map((at, i) => ({ at, label: verses[i].label })) : []}
        />
        <ActionBar label="Recall result">
          <Button
            onClick={() => {
              setResult(null);
            }}
          >
            Edit
          </Button>
          <Button variant="primary" icon="check" onClick={() => onComplete(result.perVerse)}>
            Continue
          </Button>
        </ActionBar>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {prompt ? <p className="text-[20px] font-bold">{prompt}</p> : null}
      <label htmlFor={id} className="font-semibold">
        Type it from memory
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        autoCapitalize="sentences"
        spellCheck={false}
        className="reading bordered w-full rounded-xl bg-bg p-3 text-fg"
      />
      {peeking ? (
        <div className="reading bordered rounded-xl bg-surface p-3" role="status">
          {verses.map((v) => (
            <p key={v.key}>
              <span className="mr-1.5 font-sans text-[14px] font-bold text-muted">{v.label}</span>
              {v.text}
            </p>
          ))}
        </div>
      ) : null}
      <ActionBar label="Recall controls">
        <Button icon="eye" onClick={peek}>
          Peek{peeks ? ` (${peeks})` : ""}
        </Button>
        <Button variant="primary" icon="check" disabled={!text.trim()} onClick={check}>
          Check
        </Button>
      </ActionBar>
    </div>
  );
}
