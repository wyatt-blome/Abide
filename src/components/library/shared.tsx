"use client";

// Pieces shared by the Library screens: segment nav, link-styled buttons, note and link cards.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { BookPlan, LinkOut, UserNote } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { formatRanges } from "@/lib/refs";
import { Button, Icon, cx } from "@/components/ui";

export function linkButtonClass(variant: "primary" | "secondary" | "ghost" = "secondary", extra?: string): string {
  return cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[17px] font-semibold no-underline select-none",
    "[border-width:var(--border-width)] border-solid active:brightness-90",
    variant === "primary" && "border-accent bg-accent text-accent-fg",
    variant === "secondary" && "border-border bg-surface text-fg",
    variant === "ghost" && "border-transparent bg-transparent text-fg",
    extra,
  );
}

export const LIBRARY_SEGMENTS = [
  { href: "/library", label: "My Library" },
  { href: "/library/manager", label: "Library manager" },
  { href: "/library/search", label: "Search by verse" },
  { href: "/library/how-to-add", label: "How to add a pack" },
] as const;

export type LibrarySegment = (typeof LIBRARY_SEGMENTS)[number]["href"];

export function LibraryNav({ current }: { current: LibrarySegment }) {
  return (
    <nav aria-label="Library sections" className="my-3">
      <ul className="grid grid-cols-2 gap-2">
        {LIBRARY_SEGMENTS.map((s) => {
          const active = s.href === current;
          return (
            <li key={s.href} className="flex">
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={linkButtonClass(active ? "primary" : "secondary", "flex-1 text-center text-[16px]")}
              >
                {active ? <Icon name="check" size={18} /> : null}
                <span>{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-2 mt-6 text-[20px] font-bold">
      {children}
    </h2>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="bordered rounded-full px-2.5 py-0.5 text-[14px] font-bold">{children}</span>;
}

/** Two-tap delete: first tap arms, second tap deletes. */
export function DeleteButton({ onDelete, label }: { onDelete: () => void | Promise<void>; label: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="flex gap-2">
      <Button variant="danger" icon="trash" onClick={() => void onDelete()}>
        Delete
      </Button>
      <Button icon="close" onClick={() => setArmed(false)}>
        Keep
      </Button>
    </div>
  ) : (
    <Button variant="ghost" icon="trash" iconOnly label={label} onClick={() => setArmed(true)} />
  );
}

export function NoteCard({
  note,
  book,
  meta,
  actions,
}: {
  note: UserNote;
  book?: BookPlan;
  meta?: BibleMeta;
  actions?: ReactNode;
}) {
  const bookLine = [book?.title, book?.author, book?.edition, note.page ? `p. ${note.page}` : undefined].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
  return (
    <li className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>from my reading</Tag>
        <Tag>entered by me</Tag>
        <span className="text-[15px] font-bold text-muted">{note.kind === "quote" ? "Quote" : "Note"}</span>
        <span className="flex-1" />
        {actions}
      </div>
      {note.kind === "quote" ? (
        <blockquote className="reading whitespace-pre-wrap border-l-4 border-border pl-3">{note.text}</blockquote>
      ) : (
        <p className="reading whitespace-pre-wrap">{note.text}</p>
      )}
      {bookLine.length ? <p className="text-[15px]">{bookLine.join(" · ")}</p> : null}
      <p className="text-[15px] font-semibold text-muted">
        {note.verseRanges.length ? formatRanges(note.verseRanges, meta) : "No verse tags"}
      </p>
    </li>
  );
}

export function LinkCard({ link, meta, actions }: { link: LinkOut; meta?: BibleMeta; actions?: ReactNode }) {
  return (
    <li className="bordered flex flex-col gap-1 rounded-2xl bg-surface p-4">
      <div className="flex items-start gap-2">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap -ml-1 inline-flex flex-1 items-center gap-2 px-1 text-[18px] font-semibold text-accent underline underline-offset-4"
        >
          <span>{link.title}</span>
          <Icon name="external" size={18} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {actions}
      </div>
      <span className="break-all text-[14px] text-muted">{link.url}</span>
      <p className="text-[15px]">
        <span className="font-semibold">Stated reference: </span>
        <span>{link.statedReference}</span>
      </p>
      {link.referenceEnteredByMe ? (
        <p>
          <Tag>reference entered by me</Tag>
        </p>
      ) : null}
      <p className="text-[15px] font-semibold text-muted">{formatRanges(link.verseRanges, meta)}</p>
    </li>
  );
}
