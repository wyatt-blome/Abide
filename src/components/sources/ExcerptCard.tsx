"use client";

// One verbatim excerpt with its five-field citation line:
//   author · work · exact locator · edition/translation · Source ↗ (url)
// If any of the five is missing the card renders nothing (hard rule: no unsourced text).
// Ellipses for truncatedStart/truncatedEnd are separate aria-hidden spans OUTSIDE the verbatim
// text node, so the verbatim node is always exactly a slice of the source.

import type { Excerpt, SourceWork } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { MAPPING_LABELS, type LibraryExcerpt } from "@/lib/library";
import { formatRanges } from "@/lib/refs";
import { Button, cx } from "@/components/ui";
import { SL } from "./labels";

export type CitationWork = Pick<SourceWork, "author" | "title" | "edition"> & { ocr?: boolean; ocrNote?: string };
type CitationExcerpt = Pick<Excerpt, "locator" | "url">;

const filled = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const isHttpUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim());

/** True only when author, work title, locator, edition and an http(s) source URL are all present. */
export function hasFullCitation(excerpt: CitationExcerpt | null | undefined, work: CitationWork | null | undefined): boolean {
  if (!excerpt || !work) return false;
  return (
    filled(work.author) && filled(work.title) && filled(excerpt.locator) && filled(work.edition) &&
    filled(excerpt.url) && isHttpUrl(excerpt.url)
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="px-1.5 text-muted">
      {SL.separator}
    </span>
  );
}

/** author · work · locator · edition · Source ↗ — null unless all five are present. */
export function CitationLine({ excerpt, work, className }: { excerpt: CitationExcerpt; work: CitationWork; className?: string }) {
  if (!hasFullCitation(excerpt, work)) return null;
  return (
    <p className={cx("flex flex-wrap items-center text-[15px] leading-snug", className)} data-testid="citation-line">
      <span className="font-semibold">{work.author}</span>
      <Sep />
      <cite className="italic">{work.title}</cite>
      <Sep />
      <span>{excerpt.locator}</span>
      <Sep />
      <span className="text-muted">{work.edition}</span>
      <Sep />
      <a
        href={excerpt.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap inline-flex items-center font-bold text-accent underline underline-offset-4"
      >
        {SL.source}
        <span className="sr-only">{SL.opensNewTab}</span>
      </a>
    </p>
  );
}

function Ellipsis({ srLabel }: { srLabel: string }) {
  return (
    <>
      <span aria-hidden="true" data-ellipsis="true">
        {SL.ellipsis}
      </span>
      <span className="sr-only">{srLabel}</span>
    </>
  );
}

const QA_PATH = [/\.Question$/, /\.Answer$/];

/** A creed Q&A excerpt: text = Question "\n" Answer (DECISIONS: Creeds.json). */
export function isQuestionAnswer(excerpt: Pick<LibraryExcerpt, "text" | "sourcePaths">): boolean {
  const paths = excerpt.sourcePaths;
  const parts = excerpt.text.split("\n");
  return !!paths && paths.length === 2 && parts.length === 2 && QA_PATH.every((re, i) => re.test(paths[i]));
}

/** The verbatim text, split on "\n" into paragraphs (Q./A. labels for creed Q&A). */
export function VerbatimText({ excerpt, className }: { excerpt: LibraryExcerpt; className?: string }) {
  const parts = excerpt.text.split("\n");
  const qa = isQuestionAnswer(excerpt);
  const last = parts.length - 1;
  return (
    <div className={cx("reading flex flex-col gap-2", className)}>
      {parts.map((part, i) =>
        part.length === 0 ? null : (
          <p key={i}>
            {qa ? <span className="mr-2 font-sans font-bold">{i === 0 ? SL.question : SL.answer}</span> : null}
            {i === 0 && excerpt.truncatedStart ? <Ellipsis srLabel={SL.shortenedStart} /> : null}
            <span data-verbatim="true">{part}</span>
            {i === last && excerpt.truncatedEnd ? <Ellipsis srLabel={SL.shortenedEnd} /> : null}
          </p>
        ),
      )}
    </div>
  );
}

export interface ExcerptCardProps {
  excerpt: LibraryExcerpt;
  work: CitationWork | null | undefined;
  meta?: BibleMeta;
  /** Show "Mapped to … · mapping method". Default true. */
  showMapping?: boolean;
  /** Shown as a button when the excerpt has a sectionId. */
  onReadSection?: (excerpt: LibraryExcerpt) => void;
  readSectionLabel?: string;
  className?: string;
}

export function ExcerptCard({
  excerpt,
  work,
  meta,
  showMapping = true,
  onReadSection,
  readSectionLabel = SL.readFullSection,
  className,
}: ExcerptCardProps) {
  if (!work || !hasFullCitation(excerpt, work)) return null;
  return (
    <article className={cx("bordered flex flex-col gap-3 rounded-2xl bg-surface p-4", className)} data-excerpt-id={excerpt.id}>
      <VerbatimText excerpt={excerpt} />
      {work.ocr ? <p className="text-[15px] font-semibold text-muted">{work.ocrNote?.trim() || SL.ocrDefault}</p> : null}
      <CitationLine excerpt={excerpt} work={work} />
      {showMapping && excerpt.verseRanges.length ? (
        <p className="flex flex-wrap items-center text-[15px] text-muted">
          <span className="mr-1.5 font-semibold">{SL.mappedTo}</span>
          <span>{formatRanges(excerpt.verseRanges, meta)}</span>
          <Sep />
          <span>{MAPPING_LABELS[excerpt.mappingMethod]}</span>
        </p>
      ) : null}
      {excerpt.sectionId && onReadSection ? (
        <Button icon="book" onClick={() => onReadSection(excerpt)}>
          {readSectionLabel}
        </Button>
      ) : null}
    </article>
  );
}
