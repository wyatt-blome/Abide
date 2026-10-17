"use client";

// My Library: my books, my quotes/notes, my link-outs, and official author pages (titles + URLs).

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { BookPlan, CustomAuthorPage, LinkOut, UserNote } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import type { BibleMeta } from "@/lib/meta";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, EmptyState, Icon, PageHeader, useToast } from "@/components/ui";
import { AUTHOR_SITES, type PageStatesReference } from "../../../content/links";
import { AddLinkSheet, siteFromUrl } from "./AddLinkSheet";
import { AddNoteSheet } from "./AddNoteSheet";
import { TextField } from "./fields";
import { DeleteButton, LibraryNav, LinkCard, NoteCard, SectionTitle, linkButtonClass } from "./shared";
import { useAsync } from "@/components/sources/useAsync";

const STATES_LABEL: Record<string, string> = {
  true: "Pages usually state the Bible reference",
  false: "Pages usually don't state a reference",
  varies: "Whether a page states a reference varies",
};
const statesLabel = (v: PageStatesReference) => STATES_LABEL[String(v)];

type LinkPrefill = { url?: string; title?: string; author?: string };

export function MyLibrary() {
  const toast = useToast();
  const { settings, update } = useSettings();
  const meta = useAsync<BibleMeta>("meta", loadMeta).data;
  const books = useLiveQuery(() => db.bookPlans.toArray(), [], [] as BookPlan[]);
  const notes = useLiveQuery(() => db.userNotes.orderBy("updatedAt").reverse().toArray(), [], [] as UserNote[]);
  const links = useLiveQuery(() => db.linkOuts.orderBy("updatedAt").reverse().toArray(), [], [] as LinkOut[]);
  const [noteFor, setNoteFor] = useState<{ bookId?: string } | null>(null);
  const [linkFor, setLinkFor] = useState<LinkPrefill | null>(null);

  const custom = settings.customAuthorPages ?? [];
  const [cAuthor, setCAuthor] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cUrl, setCUrl] = useState("");
  const cValid = cAuthor.trim() && cTitle.trim() && siteFromUrl(cUrl);

  const addCustom = async () => {
    if (!cValid) return;
    const page: CustomAuthorPage = { author: cAuthor.trim(), title: cTitle.trim(), url: cUrl.trim() };
    await update({ customAuthorPages: [...custom.filter((p) => p.url !== page.url), page] });
    setCAuthor("");
    setCTitle("");
    setCUrl("");
    toast("Page added", { tone: "success" });
  };
  const removeCustom = (url: string) => update({ customAuthorPages: custom.filter((p) => p.url !== url) });

  return (
    <>
      <PageHeader title="Library" />
      <LibraryNav current="/library" />

      <section aria-labelledby="lib-books">
        <SectionTitle id="lib-books">My books</SectionTitle>
        {books.length === 0 ? (
          <EmptyState
            title="No books yet"
            icon="book"
            action={
              <Link href="/read/books" className={linkButtonClass("secondary", "w-full")}>
                Add a book in Read
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {books.map((b) => (
              <li key={b.id} className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
                <p className="text-[18px] font-bold">{b.title}</p>
                <p className="text-[15px]">{[b.author, b.edition].filter(Boolean).join(" · ")}</p>
                <p className="text-[15px] text-muted">
                  {b.status === "finished" ? "Finished" : b.status === "paused" ? "Paused" : "Reading"} · {b.current} / {b.total} {b.unit}
                </p>
                <Button icon="plus" onClick={() => setNoteFor({ bookId: b.id })}>
                  Note from this book
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lib-notes">
        <SectionTitle id="lib-notes">Quotes and notes</SectionTitle>
        {notes.length === 0 ? (
          <p className="text-muted">No quotes or notes yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                book={books.find((b) => b.id === n.bookId)}
                meta={meta}
                actions={<DeleteButton label="Delete note" onDelete={() => db.userNotes.delete(n.id)} />}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lib-links">
        <SectionTitle id="lib-links">Saved links</SectionTitle>
        {links.length === 0 ? (
          <p className="text-muted">No saved links yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {links.map((l) => (
              <LinkCard
                key={l.id}
                link={l}
                meta={meta}
                actions={<DeleteButton label="Delete link" onDelete={() => db.linkOuts.delete(l.id)} />}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lib-authors">
        <SectionTitle id="lib-authors">Official author pages</SectionTitle>
        <p className="mb-3 text-[15px] text-muted">Free pages on each author&apos;s own site. Open one, then save a link to the page you read.</p>
        <ul className="flex flex-col gap-3">
          {AUTHOR_SITES.map((site) => (
            <li key={site.id} className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-[18px] font-bold">{site.author}</p>
              <p className="text-[15px]">{site.site}</p>
              <p className="text-[15px] text-muted">{statesLabel(site.pageStatesReference)}</p>
              <ul className="flex flex-col gap-2">
                {site.pages.map((p) => (
                  <AuthorPageRow
                    key={p.url}
                    title={p.title}
                    url={p.url}
                    onSave={() => setLinkFor({ url: p.url, author: site.author })}
                  />
                ))}
              </ul>
            </li>
          ))}
          {custom.length ? (
            <li className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-[18px] font-bold">Pages I added</p>
              <ul className="flex flex-col gap-2">
                {custom.map((p) => (
                  <AuthorPageRow
                    key={p.url}
                    title={`${p.author} · ${p.title}`}
                    url={p.url}
                    onSave={() => setLinkFor({ url: p.url, author: p.author })}
                    onRemove={() => removeCustom(p.url)}
                  />
                ))}
              </ul>
            </li>
          ) : null}
        </ul>

        <div className="bordered mt-3 flex flex-col gap-3 rounded-2xl p-4">
          <p className="font-bold">Add an author page</p>
          <TextField label="Author" value={cAuthor} onChange={(e) => setCAuthor(e.target.value)} />
          <TextField label="Page title" value={cTitle} onChange={(e) => setCTitle(e.target.value)} />
          <TextField
            label="Web address"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://"
            value={cUrl}
            onChange={(e) => setCUrl(e.target.value)}
          />
          <Button icon="plus" disabled={!cValid} onClick={addCustom}>
            Add page
          </Button>
        </div>
      </section>

      <ActionBar label="Library actions">
        <Button variant="primary" icon="plus" onClick={() => setNoteFor({})}>
          Note
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setLinkFor({})}>
          Link
        </Button>
      </ActionBar>

      <AddNoteSheet open={noteFor !== null} onClose={() => setNoteFor(null)} bookId={noteFor?.bookId} />
      <AddLinkSheet
        open={linkFor !== null}
        onClose={() => setLinkFor(null)}
        initialUrl={linkFor?.url}
        initialTitle={linkFor?.title}
        initialAuthor={linkFor?.author}
      />
    </>
  );
}

function AuthorPageRow({
  title,
  url,
  onSave,
  onRemove,
}: {
  title: string;
  url: string;
  onSave: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-t-[length:var(--border-width)] border-border pt-2">
      <p className="font-semibold">{title}</p>
      <span className="break-all text-[14px] text-muted">{url}</span>
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkButtonClass("secondary")}>
          <Icon name="external" size={20} />
          <span>Open</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <Button icon="plus" onClick={onSave}>
          Save a link-out
        </Button>
        {onRemove ? <DeleteButton label={`Remove ${title}`} onDelete={onRemove} /> : null}
      </div>
    </li>
  );
}
