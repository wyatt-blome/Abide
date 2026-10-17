"use client";

// Search my notes and saved links by verse (multi-entry verseKeys index).

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { BookPlan, VerseRange } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import type { BibleMeta } from "@/lib/meta";
import { keysCovered } from "@/lib/refs";
import { ReferencePicker } from "@/components/ReferencePicker";
import { PageHeader } from "@/components/ui";
import { useAsync } from "@/components/sources/useAsync";
import { LibraryNav, LinkCard, NoteCard, SectionTitle } from "./shared";

export function NoteSearch() {
  const meta = useAsync<BibleMeta>("meta", loadMeta).data;
  const [ranges, setRanges] = useState<VerseRange[]>([]);
  const keys = useMemo(() => (meta && ranges.length ? keysCovered(meta, ranges) : null), [meta, ranges]);
  const books = useLiveQuery(() => db.bookPlans.toArray(), [], [] as BookPlan[]);
  const notes = useLiveQuery(async () => (keys ? db.userNotes.where("verseKeys").anyOf(keys).distinct().toArray() : null), [keys], null);
  const links = useLiveQuery(async () => (keys ? db.linkOuts.where("verseKeys").anyOf(keys).distinct().toArray() : null), [keys], null);

  return (
    <>
      <PageHeader title="Search by verse" backHref="/library" />
      <LibraryNav current="/library/search" />
      <ReferencePicker label="Passages to search" multiple value={ranges} onChange={setRanges} />

      {keys ? (
        <>
          <section aria-labelledby="search-notes">
            <SectionTitle id="search-notes">Quotes and notes</SectionTitle>
            {notes === null ? <p role="status" className="text-muted">Loading…</p> : null}
            {notes && notes.length === 0 ? <p className="text-muted">No notes tagged to these verses.</p> : null}
            {notes && notes.length ? (
              <ul className="flex flex-col gap-3">
                {[...notes].sort((a, b) => b.createdAt - a.createdAt).map((n) => (
                  <NoteCard key={n.id} note={n} book={books.find((b) => b.id === n.bookId)} meta={meta} />
                ))}
              </ul>
            ) : null}
          </section>
          <section aria-labelledby="search-links">
            <SectionTitle id="search-links">Saved links</SectionTitle>
            {links === null ? <p role="status" className="text-muted">Loading…</p> : null}
            {links && links.length === 0 ? <p className="text-muted">No links tagged to these verses.</p> : null}
            {links && links.length ? (
              <ul className="flex flex-col gap-3">
                {[...links].sort((a, b) => b.createdAt - a.createdAt).map((l) => (
                  <LinkCard key={l.id} link={l} meta={meta} />
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}
