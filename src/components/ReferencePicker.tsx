"use client";

// Reference picker: type a reference ("Rom 8:28-30; Ps 23") or browse book → chapter → verses.
// value is always a list of ranges; with `multiple` false a pick replaces the list.

import { useEffect, useId, useState, type FormEvent } from "react";
import type { VerseRange } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import { BOOKS } from "@/lib/books";
import type { BibleMeta } from "@/lib/meta";
import { chapterCount, compareRefs, formatRange, parseReference, rangesOverlap, versesIn } from "@/lib/refs";
import { Button, cx, Icon, Stepper } from "@/components/ui";

export interface ReferencePickerProps {
  value: VerseRange[];
  onChange: (value: VerseRange[]) => void;
  /** Allow several ranges (each pick is added). Default false (a pick replaces the value). */
  multiple?: boolean;
  /** Visible label for the whole picker. */
  label: string;
}

type Step = { kind: "closed" } | { kind: "books" } | { kind: "chapters"; book: string } | { kind: "verses"; book: string; chapter: number };

const gridBtn = cx(
  "min-h-12 rounded-xl bg-surface px-2 text-[16px] font-semibold text-fg",
  "[border-width:var(--border-width)] border-solid border-border active:brightness-90",
);

export function ReferencePicker({ value, onChange, multiple = false, label }: ReferencePickerProps) {
  const id = useId();
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [startV, setStartV] = useState(1);
  const [endV, setEndV] = useState(1);

  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => alive && setMetaError(true));
    return () => {
      alive = false;
    };
  }, []);

  const commit = (ranges: VerseRange[]) => {
    if (!multiple) {
      onChange(ranges.slice(0, 1));
      return;
    }
    const next = [...value];
    for (const r of ranges) {
      if (!next.some((x) => compareRefs(x.start, r.start) === 0 && compareRefs(x.end, r.end) === 0)) next.push(r);
    }
    next.sort((a, b) => compareRefs(a.start, b.start));
    onChange(next);
  };

  const onSubmitText = (e: FormEvent) => {
    e.preventDefault();
    const input = text.trim();
    if (!input) {
      setError("Type a reference first.");
      return;
    }
    if (!meta) {
      setError("Bible data is still loading. Try again in a moment.");
      return;
    }
    const parsed = parseReference(input, meta);
    if (!parsed || !parsed.length) {
      setError(`Couldn't read "${input.slice(0, 40)}". Try a form like Rom 8:28-30 or Ps 23.`);
      return;
    }
    if (!multiple && parsed.length > 1) {
      setError("Pick one passage here (no semicolons).");
      return;
    }
    setError(null);
    setText("");
    commit(parsed);
  };

  const openVerses = (book: string, chapter: number) => {
    if (!meta) return;
    setStartV(1);
    setEndV(versesIn(meta, book, chapter));
    setStep({ kind: "verses", book, chapter });
  };

  const openBook = (book: string) => {
    if (!meta) return;
    if (chapterCount(meta, book) === 1) openVerses(book, 1);
    else setStep({ kind: "chapters", book });
  };

  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  const pickedRange: VerseRange | null =
    step.kind === "verses"
      ? { start: { book: step.book, chapter: step.chapter, verse: startV }, end: { book: step.book, chapter: step.chapter, verse: endV } }
      : null;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1 text-[17px] font-bold">{label}</legend>

      {value.length ? (
        <ul className="flex flex-col gap-2" aria-label="Selected passages">
          {value.map((r, i) => (
            <li key={`${formatRange(r)}-${i}`} className="bordered flex min-h-12 items-center gap-2 rounded-xl bg-surface pl-3">
              <Icon name="check" size={20} className="text-success" />
              <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{formatRange(r, meta ?? undefined)}</span>
              {multiple || value.length > 1 ? (
                <Button variant="ghost" icon="close" iconOnly label={`Remove ${formatRange(r, meta ?? undefined)}`} onClick={() => remove(i)} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No passage chosen yet.</p>
      )}

      <form onSubmit={onSubmitText} className="flex flex-col gap-2" noValidate>
        <label htmlFor={`${id}-text`} className="font-semibold">
          Type a reference
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-text`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="e.g. Rom 8:28-30"
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            className="bordered min-h-12 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[18px] text-fg"
          />
          <Button type="submit" variant="primary">
            {multiple ? "Add" : "Use"}
          </Button>
        </div>
        {error ? (
          <p id={`${id}-err`} role="alert" className="flex items-start gap-2 font-semibold text-danger">
            <Icon name="cross" size={20} />
            <span>{error}</span>
          </p>
        ) : null}
        {metaError ? <p role="alert" className="text-danger">Bible data couldn&apos;t load.</p> : null}
      </form>

      {step.kind === "closed" ? (
        <Button icon="book" onClick={() => setStep({ kind: "books" })} disabled={!meta}>
          Pick from the book list
        </Button>
      ) : null}

      {step.kind === "books" && meta ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-bold">Choose a book</span>
            <Button variant="ghost" icon="close" onClick={() => setStep({ kind: "closed" })}>
              Close
            </Button>
          </div>
          {(["OT", "NT"] as const).map((t) => (
            <div key={t} role="group" aria-label={t === "OT" ? "Old Testament" : "New Testament"}>
              <p className="mb-1 text-[15px] font-bold text-muted">{t === "OT" ? "Old Testament" : "New Testament"}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BOOKS.filter((b) => b.testament === t && chapterCount(meta, b.code) > 0).map((b) => (
                  <button key={b.code} type="button" className={gridBtn} onClick={() => openBook(b.code)}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {step.kind === "chapters" && meta ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon="chevronLeft" onClick={() => setStep({ kind: "books" })}>
              Books
            </Button>
            <span className="flex-1 font-bold">{BOOKS.find((b) => b.code === step.book)?.name} — chapter</span>
          </div>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="Chapters">
            {Array.from({ length: chapterCount(meta, step.book) }, (_, i) => i + 1).map((c) => (
              <button key={c} type="button" className={gridBtn} onClick={() => openVerses(step.book, c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step.kind === "verses" && meta && pickedRange ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              icon="chevronLeft"
              onClick={() => (chapterCount(meta, step.book) === 1 ? setStep({ kind: "books" }) : setStep({ kind: "chapters", book: step.book }))}
            >
              {chapterCount(meta, step.book) === 1 ? "Books" : "Chapters"}
            </Button>
            <span className="flex-1 font-bold">{formatRange(pickedRange, meta)}</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Stepper
              label="From verse"
              value={startV}
              min={1}
              max={versesIn(meta, step.book, step.chapter)}
              onChange={(v) => {
                setStartV(v);
                if (endV < v) setEndV(v);
              }}
            />
            <Stepper label="To verse" value={endV} min={startV} max={versesIn(meta, step.book, step.chapter)} onChange={setEndV} />
          </div>
          <Button
            onClick={() => {
              setStartV(1);
              setEndV(versesIn(meta, step.book, step.chapter));
            }}
          >
            Whole chapter
          </Button>
          <Button
            variant="primary"
            icon={multiple ? "plus" : "check"}
            onClick={() => {
              if (multiple && value.some((r) => rangesOverlap(r, pickedRange))) {
                setError("That overlaps a passage already chosen.");
                return;
              }
              setError(null);
              commit([pickedRange]);
              setStep({ kind: "closed" });
            }}
          >
            {multiple ? `Add ${formatRange(pickedRange, meta)}` : `Use ${formatRange(pickedRange, meta)}`}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
