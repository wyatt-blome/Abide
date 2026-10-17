"use client";

// Add a quote or note from my reading: text, optional book + page, verse tags.
// Saved notes are always shown as "from my reading" / "entered by me".

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { saveUserNote } from "@/db/repo";
import type { BookPlan, UserNote, VerseRange } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import { ReferencePicker } from "@/components/ReferencePicker";
import { Button, ChipGroup, Sheet, useToast } from "@/components/ui";
import { FieldError, SelectField, TextArea, TextField } from "./fields";

export interface AddNoteSheetProps {
  open: boolean;
  onClose: () => void;
  initialRanges?: VerseRange[];
  bookId?: string;
  page?: string;
  onSaved?: (note: UserNote) => void;
}

export function AddNoteSheet(props: AddNoteSheetProps) {
  if (!props.open) return null;
  return <AddNoteForm {...props} />;
}

const KIND_OPTIONS = [
  { value: "quote" as const, label: "Quote" },
  { value: "note" as const, label: "Note" },
];

function AddNoteForm({ onClose, initialRanges, bookId: initialBookId, page: initialPage, onSaved }: AddNoteSheetProps) {
  const toast = useToast();
  const books = useLiveQuery(() => db.bookPlans.toArray(), [], [] as BookPlan[]);
  const [kind, setKind] = useState<UserNote["kind"]>("quote");
  const [text, setText] = useState("");
  const [bookId, setBookId] = useState(initialBookId ?? "");
  const [page, setPage] = useState(initialPage ?? "");
  const [ranges, setRanges] = useState<VerseRange[]>(initialRanges ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = text.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await loadMeta();
      const note = await saveUserNote(
        {
          kind,
          text: text.trim(),
          bookId: bookId || undefined,
          page: page.trim() || undefined,
          verseRanges: ranges,
        },
        meta,
      );
      toast("Saved to my reading", { tone: "success" });
      onSaved?.(note);
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
      title="Add from my reading"
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
        <ChipGroup
          label="Kind"
          showLabel
          single
          options={KIND_OPTIONS}
          selected={[kind]}
          onChange={(v) => v[0] && setKind(v[0])}
        />
        <TextArea
          label={kind === "quote" ? "Quote (as printed)" : "My note"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <SelectField label="Book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">No book</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.author ? `${b.title} · ${b.author}` : b.title}
            </option>
          ))}
        </SelectField>
        <TextField label="Page" inputMode="text" value={page} onChange={(e) => setPage(e.target.value)} />
        <ReferencePicker label="Verses this is about" multiple value={ranges} onChange={setRanges} />
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </Sheet>
  );
}
