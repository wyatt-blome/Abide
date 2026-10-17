"use client";

// Save a link-out: title + URL + the reference as written on the page, tagged to verses that I
// confirm. The URL is never fetched; nothing from the page is copied.

import { useEffect, useState } from "react";
import { saveLinkOut } from "@/db/repo";
import type { LinkOut, VerseRange } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import type { BibleMeta } from "@/lib/meta";
import { compareRefs, formatRanges, parseReference } from "@/lib/refs";
import { ReferencePicker } from "@/components/ReferencePicker";
import { Button, Sheet, useToast } from "@/components/ui";
import { CheckboxRow, FieldError, TextField } from "./fields";

export interface AddLinkSheetProps {
  open: boolean;
  onClose: () => void;
  initialRanges?: VerseRange[];
  initialUrl?: string;
  initialTitle?: string;
  initialAuthor?: string;
  onSaved?: (link: LinkOut) => void;
}

/** "https://www.example.org/x" → "example.org"; "" for anything that is not an http(s) URL. */
export function siteFromUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

const sameRanges = (a: VerseRange[], b: VerseRange[]) =>
  a.length === b.length && a.every((r, i) => compareRefs(r.start, b[i].start) === 0 && compareRefs(r.end, b[i].end) === 0);

export function AddLinkSheet(props: AddLinkSheetProps) {
  if (!props.open) return null;
  return <AddLinkForm {...props} />;
}

function AddLinkForm({ onClose, initialRanges, initialUrl, initialTitle, initialAuthor, onSaved }: AddLinkSheetProps) {
  const toast = useToast();
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [author, setAuthor] = useState(initialAuthor ?? "");
  const [stated, setStated] = useState("");
  const [enteredByMe, setEnteredByMe] = useState(false);
  const [ranges, setRanges] = useState<VerseRange[]>(initialRanges ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const site = siteFromUrl(url);
  const parsed = meta && stated.trim() ? parseReference(stated.trim(), meta) : null;
  const canPrefill = !!parsed && parsed.length > 0 && !sameRanges(parsed, ranges);

  const changeRanges = (next: VerseRange[]) => {
    setRanges(next);
    setConfirmed(false);
  };

  const missing: string[] = [];
  if (!site) missing.push("a web address");
  if (!title.trim()) missing.push("a title");
  if (!stated.trim()) missing.push("the stated reference");
  if (!ranges.length) missing.push("at least one verse tag");
  else if (!confirmed) missing.push("confirmed verse tags");
  const canSave = missing.length === 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const m = meta ?? (await loadMeta());
      const link = await saveLinkOut(
        {
          url: url.trim(),
          title: title.trim(),
          author: author.trim() || undefined,
          site,
          statedReference: stated.trim(),
          referenceEnteredByMe: enteredByMe || undefined,
          verseRanges: ranges,
        },
        m,
      );
      toast("Link saved", { tone: "success" });
      onSaved?.(link);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Save a link"
      footer={
        <>
          <Button icon="close" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" disabled={!canSave} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Web address"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={url.trim() && !site ? "Enter a full web address starting with https://" : null}
        />
        {site ? (
          <p className="text-[15px]">
            <span className="font-semibold">Site: </span>
            <span>{site}</span>
          </p>
        ) : null}
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <TextField
          label="Stated reference"
          hint="As written on the page, e.g. Romans 8:28"
          value={stated}
          onChange={(e) => setStated(e.target.value)}
          onBlur={() => {
            if (parsed && parsed.length && ranges.length === 0) changeRanges(parsed);
          }}
        />
        <CheckboxRow
          label="The page doesn't state a reference; I typed it from the content"
          checked={enteredByMe}
          onChange={setEnteredByMe}
        />
        {canPrefill ? (
          <Button icon="refresh" onClick={() => changeRanges(parsed)}>
            {`Use ${formatRanges(parsed, meta ?? undefined)} as verse tags`}
          </Button>
        ) : null}
        <ReferencePicker label="Verse tags" multiple value={ranges} onChange={changeRanges} />
        <CheckboxRow
          label="Confirm tags: these verses match the stated reference"
          checked={confirmed}
          disabled={ranges.length === 0}
          onChange={setConfirmed}
        />
        {missing.length && !busy ? (
          <p className="text-[15px] text-muted" aria-live="polite">
            {`To save, add ${missing.join(", ")}.`}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </Sheet>
  );
}
