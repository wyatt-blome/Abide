"use client";

// "Story of the Passage": Type First Letters on the BSB section headings of the plan range, in
// order; then the verses, grouped under each heading. Heading text comes only from
// headings.json and is captioned "Heading: Berean Standard Bible".

import { useMemo, useState } from "react";
import type { BsbHeading } from "@/db/types";
import { compareRefs } from "@/lib/refs";
import { ActionBar, Button, Icon } from "@/components/ui";
import { TypeFirst, type TypeFirstResult, type TypeItem } from "./TypeFirst";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export const HEADING_CAPTION = "Heading: Berean Standard Bible";

/** Section headings used by the drill (Psalm superscriptions, level "d", are not section headings). */
export const storyHeadings = (headings: BsbHeading[]): BsbHeading[] => headings.filter((h) => h.level !== "d");

export interface HeadingsDrillProps {
  /** BSB headings within the plan range (canonical order). */
  headings: BsbHeading[];
  verses: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy, note: string) => void;
}

export function HeadingsDrill({ headings, verses, onComplete }: HeadingsDrillProps) {
  const list = useMemo(() => storyHeadings(headings), [headings]);
  const [phase, setPhase] = useState<"headings" | "between" | "verses">("headings");
  const [headResult, setHeadResult] = useState<TypeFirstResult | null>(null);

  const headingItems: TypeItem[] = useMemo(
    () => list.map((h, i) => ({ id: `h${i}`, label: `${i + 1}.`, text: h.text })),
    [list],
  );

  // Each heading is shown above the first drilled verse at or after it (verses with no text are skipped).
  const verseItems: TypeItem[] = useMemo(() => {
    let hi = 0;
    return verses.map((v) => {
      const hs: string[] = [];
      while (hi < list.length && compareRefs(list[hi], v.ref) <= 0) hs.push(list[hi++].text);
      return { id: v.key, label: v.label, text: v.text, headings: hs.length ? hs : undefined };
    });
  }, [list, verses]);

  const headNote = (r: TypeFirstResult) => {
    const right = Object.values(r.perItem).reduce((a, x) => a + x.firstTry, 0);
    const total = Object.values(r.perItem).reduce((a, x) => a + x.total, 0);
    return `Headings: ${right} of ${total} words right first try`;
  };

  if (!list.length) return <p className="font-semibold">No BSB headings in this range</p>;

  if (phase === "headings") {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-semibold">Type the first letter of each word of the headings, in order.</p>
        <p className="text-[13px] font-semibold text-muted">{HEADING_CAPTION}</p>
        <TypeFirst
          items={headingItems}
          onComplete={(r) => {
            setHeadResult(r);
            setPhase("between");
          }}
        />
      </div>
    );
  }

  if (phase === "between" && headResult) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-[19px] font-bold">
          <Icon name="check" size={24} className="text-success" />
          {headNote(headResult)}
        </p>
        <p className="text-[13px] font-semibold text-muted">{HEADING_CAPTION}</p>
        <ol className="list-decimal pl-6">
          {list.map((h, i) => (
            <li key={i} className="font-semibold">
              {h.text}
            </li>
          ))}
        </ol>
        <p>Next: the verses under each heading.</p>
        <ActionBar label="Story of the Passage">
          <Button onClick={() => onComplete({}, headNote(headResult))}>Finish here</Button>
          <Button variant="primary" icon="chevronRight" onClick={() => setPhase("verses")}>
            Verses
          </Button>
        </ActionBar>
      </div>
    );
  }

  return (
    <TypeFirst
      items={verseItems}
      headingsCaption={HEADING_CAPTION}
      onComplete={(r) => {
        const out: PerVerseAccuracy = {};
        for (const v of verses) if (r.perItem[v.key]) out[v.key] = r.perItem[v.key].accuracy;
        onComplete(out, headResult ? headNote(headResult) : "");
      }}
    />
  );
}
