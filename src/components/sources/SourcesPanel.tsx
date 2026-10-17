"use client";

// Sources for one passage. Every text shown is one of: a verbatim excerpt (with its five-field
// citation), a BSB heading or verse, a citation field value, the user's own note/link, or a fixed
// label from ./labels. Sections, in order:
//   1 Outline (BSB headings)  2 Book introduction (Henry)  3 What others wrote (by era)
//   4 Cross-references (OpenBible.info)  5 From my reading (user notes)  6 Links

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { BookPlan, BsbHeading, Era, LinkOut, SourceType, TranslationId, UserNote, VerseRange, VerseRef } from "@/db/types";
import { getRangeVerses, headingsInRange, loadHeadings, loadMeta } from "@/lib/bible";
import { BOOK_CODES } from "@/lib/books";
import { resolveEnabledPackIds } from "@/lib/enabledPacks";
import {
  CROSSREF_PACK_ID, ERA_LABELS, ERA_ORDER, TYPE_LABELS, crossRefsForRange, excerptsForRange, loadLibraryIndex, sectionFor,
  type LibraryExcerpt, type LibraryIndex, type LibraryWork,
} from "@/lib/library";
import { iterateRange, rangeKeys, type BibleMeta } from "@/lib/meta";
import { clampRange, compareRefs, formatRange, formatRanges, formatRef, fromKey, rangeId, toKey } from "@/lib/refs";
import { Button, Chip, Icon, Sheet, cx } from "@/components/ui";
import { useSettings } from "@/components/providers/AppProviders";
import { bibleProjectLinksForRange } from "../../../content/bibleproject";
import { ExcerptCard, hasFullCitation } from "./ExcerptCard";
import { SL, TYPE_FILTER_ALL, pageLabel, versesLabel } from "./labels";
import { useAsync } from "./useAsync";

export const HENRY_PACK_ID = "henry-commentary";
export const OPENBIBLE_ATTRIBUTION_URL = "https://www.openbible.info/labs/cross-references/";
const CROSSREF_PAGE = 10;

export interface SourcesPanelProps {
  range: VerseRange;
  translation: TranslationId;
}


const linkClass = cx(
  "tap inline-flex items-center gap-2 rounded-xl px-3 font-semibold text-accent underline underline-offset-4",
);

// ---------------------------------------------------------------- outline helpers

export interface OutlineSegment {
  headings: BsbHeading[];
  start: VerseRef;
  end: VerseRef;
}

/** Split the range at BSB heading verses; a leading part with no heading has headings = []. */
export function outlineSegments(meta: BibleMeta, headings: BsbHeading[], range: VerseRange): OutlineSegment[] {
  const byKey = new Map<string, BsbHeading[]>();
  for (const h of headingsInRange(headings, range)) {
    const k = `${h.book}.${h.chapter}.${h.verse}`;
    byKey.set(k, [...(byKey.get(k) ?? []), h]);
  }
  const out: OutlineSegment[] = [];
  for (const ref of iterateRange(meta, range)) {
    const hs = byKey.get(toKey(ref));
    const cur = out[out.length - 1];
    if (hs || !cur) out.push({ headings: hs ?? [], start: ref, end: ref });
    else cur.end = ref;
  }
  return out;
}

/** "vv. 1–17" inside a single chapter, otherwise a full reference. */
export function segmentLabel(seg: OutlineSegment, range: VerseRange, meta: BibleMeta): string {
  const oneChapter = range.start.book === range.end.book && range.start.chapter === range.end.chapter;
  return oneChapter ? versesLabel(seg.start.verse, seg.end.verse) : formatRange({ start: seg.start, end: seg.end }, meta);
}

export function headingsDrillHref(range: VerseRange): string {
  return `/memorize/practice?mode=headings&range=${encodeURIComponent(rangeId(range))}`;
}

export function readerHref(ref: VerseRef, translation: TranslationId): string {
  return `/read/reader?book=${encodeURIComponent(ref.book)}&chapter=${ref.chapter}&v=${ref.verse}&t=${translation}`;
}

// ---------------------------------------------------------------- layout bits

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-[20px] font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}

function Status({ loading, error }: { loading: boolean; error?: unknown }) {
  if (loading) return <p role="status" className="text-muted">{SL.loading}</p>;
  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 font-semibold text-danger">
        <Icon name="cross" size={20} />
        <span>{SL.loadFailed}</span>
      </p>
    );
  }
  return null;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="bordered rounded-full px-2.5 py-0.5 text-[14px] font-bold">{children}</span>;
}

// ---------------------------------------------------------------- panel

export function SourcesPanel({ range, translation }: SourcesPanelProps) {
  const { settings, ready } = useSettings();
  const rid = rangeId(range);
  const packsKey = ready ? `${rid}|${[...settings.enabledPacks].sort().join(",")}` : null;

  const metaQ = useAsync("meta", loadMeta);
  const meta = metaQ.data;
  const headingsQ = useAsync("headings", loadHeadings);
  const indexQ = useAsync<LibraryIndex>("index", loadLibraryIndex);
  const packsQ = useAsync(packsKey, () => resolveEnabledPackIds(settings.enabledPacks));
  const packs = packsQ.data;
  const excerptsQ = useAsync(packs ? `${packsKey}|x` : null, () => excerptsForRange(range, packs ?? []));
  const crossOn = !!packs?.includes(CROSSREF_PACK_ID) && !!indexQ.data?.works.some((w) => w.id === CROSSREF_PACK_ID);
  const crossQ = useAsync(packs && indexQ.data ? `${packsKey}|c|${crossOn}` : null, () =>
    crossOn ? crossRefsForRange(range) : Promise.resolve([]),
  );

  const keys = useMemo(() => (meta ? rangeKeys(meta, range) : null), [meta, rid]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = useLiveQuery(
    async () => (keys ? db.userNotes.where("verseKeys").anyOf(keys).distinct().toArray() : null),
    [keys],
    null,
  );
  const links = useLiveQuery(
    async () => (keys ? db.linkOuts.where("verseKeys").anyOf(keys).distinct().toArray() : null),
    [keys],
    null,
  );
  const bookPlans = useLiveQuery(() => db.bookPlans.toArray(), [], [] as BookPlan[]);

  const works = useMemo(() => new Map((indexQ.data?.works ?? []).map((w) => [w.id, w])), [indexQ.data]);
  const henryOn = !!packs?.includes(HENRY_PACK_ID) && works.has(HENRY_PACK_ID);

  const all = useMemo(
    () => (excerptsQ.data ?? []).filter((x) => hasFullCitation(x, works.get(x.workId))),
    [excerptsQ.data, works],
  );
  const intros = henryOn ? all.filter((x) => x.isBookIntro && x.workId === HENRY_PACK_ID) : [];
  const others = all.filter((x) => !(henryOn && x.isBookIntro && x.workId === HENRY_PACK_ID));

  const [sectionOf, setSectionOf] = useState<LibraryExcerpt | null>(null);
  const sectionQ = useAsync(sectionOf ? sectionOf.id : null, () => (sectionOf ? sectionFor(sectionOf) : Promise.resolve(null)));

  const hasMine = (notes?.length ?? 0) > 0 || (links?.length ?? 0) > 0;
  const uid = rid.replace(/[^A-Za-z0-9]/g, "");

  return (
    <div className="flex flex-col gap-8" data-testid="sources-panel">
      <Section id={`${uid}-outline`} title={SL.outline}>
        <Status loading={metaQ.loading || headingsQ.loading} error={metaQ.error ?? headingsQ.error} />
        {meta && headingsQ.data ? <Outline meta={meta} headings={headingsQ.data} range={range} /> : null}
      </Section>

      <Section id={`${uid}-intro`} title={SL.bookIntro}>
        {excerptsQ.loading && henryOn ? <Status loading /> : null}
        {!henryOn || (!excerptsQ.loading && intros.length === 0) ? <Muted>{SL.noBookIntro}</Muted> : null}
        {intros.map((x) => (
          <ExcerptCard
            key={x.id}
            excerpt={x}
            work={works.get(x.workId)}
            meta={meta}
            onReadSection={setSectionOf}
            readSectionLabel={SL.readFullIntro}
          />
        ))}
      </Section>

      <Section id={`${uid}-others`} title={SL.othersWrote}>
        <Status loading={excerptsQ.loading || indexQ.loading} error={excerptsQ.error ?? indexQ.error} />
        {!excerptsQ.loading && !excerptsQ.error ? (
          <OthersWrote excerpts={others} works={works} meta={meta} hasMine={hasMine} onReadSection={setSectionOf} />
        ) : null}
      </Section>

      <Section id={`${uid}-xrefs`} title={SL.crossRefs}>
        <Status loading={crossQ.loading} error={crossQ.error} />
        {!crossQ.loading && !crossOn ? <Muted>{SL.crossRefsOff}</Muted> : null}
        {crossOn && crossQ.data ? <CrossRefs refs={crossQ.data} meta={meta} translation={translation} rid={rid} /> : null}
      </Section>

      <Section id={`${uid}-mine`} title={SL.fromMyReading}>
        {notes === null ? <Status loading /> : null}
        {notes && notes.length === 0 ? <Muted>{SL.noNotes}</Muted> : null}
        {notes && notes.length ? (
          <ul className="flex flex-col gap-3">
            {[...notes].sort((a, b) => b.createdAt - a.createdAt).map((n) => (
              <NoteItem key={n.id} note={n} book={bookPlans.find((b) => b.id === n.bookId)} meta={meta} />
            ))}
          </ul>
        ) : null}
      </Section>

      <Section id={`${uid}-links`} title={SL.links}>
        <ul className="flex flex-col gap-3">
          {bibleProjectLinksForRange(range, BOOK_CODES).map((l) => (
            <li key={l.url} className="bordered flex flex-col gap-1 rounded-2xl bg-surface p-4">
              <span className="text-[15px] font-bold text-muted">{l.isVideo ? SL.bibleProjectVideo : SL.bibleProjectExplore}</span>
              <ExternalTitle url={l.url} title={l.title} />
            </li>
          ))}
        </ul>
        <h3 className="text-[17px] font-bold">{SL.myLinks}</h3>
        {links === null ? <Status loading /> : null}
        {links && links.length === 0 ? <Muted>{SL.noLinks}</Muted> : null}
        {links && links.length ? (
          <ul className="flex flex-col gap-3">
            {[...links].sort((a, b) => b.createdAt - a.createdAt).map((l) => (
              <LinkItem key={l.id} link={l} />
            ))}
          </ul>
        ) : null}
      </Section>

      <Sheet open={sectionOf !== null} onClose={() => setSectionOf(null)} title={SL.fullSectionTitle}>
        {sectionOf ? (
          <>
            <Status loading={sectionQ.loading} error={sectionQ.error} />
            {!sectionQ.loading && !sectionQ.error && !sectionQ.data ? <Muted>{SL.noFullSection}</Muted> : null}
            {sectionQ.data ? <ExcerptCard excerpt={sectionQ.data} work={works.get(sectionQ.data.workId)} meta={meta} /> : null}
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- 1 outline

function Outline({ meta, headings, range }: { meta: BibleMeta; headings: BsbHeading[]; range: VerseRange }) {
  const r = clampRange(meta, range);
  const segs = outlineSegments(meta, headings, r);
  const anyHeading = segs.some((s) => s.headings.length > 0);
  return (
    <>
      <ol className="flex flex-col gap-2">
        {segs.map((s) => (
          <li key={toKey(s.start)} className="bordered flex flex-col gap-1 rounded-2xl bg-surface px-4 py-3">
            {s.headings.length ? (
              <>
                {s.headings.map((h, i) => (
                  <p key={i} className={cx("reading font-bold", h.level === "ms" && "uppercase")}>
                    {h.text}
                  </p>
                ))}
                <span className="text-[14px] text-muted">{SL.headingSource}</span>
              </>
            ) : (
              <span className="text-[14px] font-bold text-muted">{SL.versesOnly}</span>
            )}
            <span className="font-semibold">{segmentLabel(s, r, meta)}</span>
          </li>
        ))}
      </ol>
      {anyHeading ? (
        <Link
          href={headingsDrillHref(r)}
          className="tap bordered inline-flex items-center justify-center gap-2 rounded-xl bg-surface px-4 font-semibold"
        >
          <Icon name="list" />
          <span>{SL.storyDrill}</span>
        </Link>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- 3 what others wrote

function OthersWrote({
  excerpts,
  works,
  meta,
  hasMine,
  onReadSection,
}: {
  excerpts: LibraryExcerpt[];
  works: Map<string, LibraryWork>;
  meta?: BibleMeta;
  hasMine: boolean;
  onReadSection: (x: LibraryExcerpt) => void;
}) {
  const [types, setTypes] = useState<SourceType[]>([]);
  const present = (Object.keys(TYPE_LABELS) as SourceType[]).filter((t) => excerpts.some((x) => x.type === t));
  const shown = types.length ? excerpts.filter((x) => types.includes(x.type)) : excerpts;
  const byEra = new Map<Era, LibraryExcerpt[]>();
  for (const x of shown) byEra.set(x.era, [...(byEra.get(x.era) ?? []), x]);

  if (!excerpts.length && !hasMine) return <Muted>{SL.noExcerpts}</Muted>;
  return (
    <div className="flex flex-col gap-5">
      {present.length > 1 ? (
        <div role="group" aria-label={SL.filterByType} className="flex flex-wrap gap-2">
          <Chip pressed={types.length === 0} onPressedChange={() => setTypes([])}>
            {TYPE_FILTER_ALL}
          </Chip>
          {present.map((t) => (
            <Chip
              key={t}
              pressed={types.includes(t)}
              onPressedChange={(on) => setTypes((cur) => (on ? [...cur, t] : cur.filter((x) => x !== t)))}
            >
              {TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      ) : null}
      {!excerpts.length ? <Muted>{SL.noExcerpts}</Muted> : null}
      {excerpts.length && !shown.length ? <Muted>{SL.noExcerptsForType}</Muted> : null}
      {ERA_ORDER.map((era) => {
        const list = byEra.get(era) ?? [];
        const pointer = era === "modern" && hasMine;
        if (!list.length && !pointer) return null;
        return (
          <div key={era} className="flex flex-col gap-3">
            <h3 className="text-[18px] font-bold">{ERA_LABELS[era]}</h3>
            {list.map((x) => (
              <ExcerptCard key={x.id} excerpt={x} work={works.get(x.workId)} meta={meta} onReadSection={onReadSection} />
            ))}
            {pointer ? <Muted>{SL.modernPointer}</Muted> : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 4 cross-references

interface CrossRefRow {
  to: VerseRange;
  votes: number;
  from: string[];
}

export function groupCrossRefs(refs: { from: string; to: VerseRange; votes: number }[]): CrossRefRow[] {
  const byTo = new Map<string, CrossRefRow>();
  for (const x of refs) {
    const k = rangeId(x.to);
    const row = byTo.get(k);
    if (row) {
      row.votes = Math.max(row.votes, x.votes);
      if (!row.from.includes(x.from)) row.from.push(x.from);
    } else byTo.set(k, { to: x.to, votes: x.votes, from: [x.from] });
  }
  return [...byTo.values()]
    .map((r) => ({ ...r, from: [...r.from].sort((a, b) => compareRefs(fromKey(a), fromKey(b))) }))
    .sort((a, b) => b.votes - a.votes || compareRefs(a.to.start, b.to.start));
}

function CrossRefs({
  refs,
  meta,
  translation,
  rid,
}: {
  refs: { from: string; to: VerseRange; votes: number }[];
  meta?: BibleMeta;
  translation: TranslationId;
  rid: string;
}) {
  const rows = useMemo(() => groupCrossRefs(refs), [refs]);
  const [shownFor, setShownFor] = useState<{ rid: string; n: number }>({ rid, n: CROSSREF_PAGE });
  const n = shownFor.rid === rid ? shownFor.n : CROSSREF_PAGE;
  return (
    <>
      {rows.length === 0 ? <Muted>{SL.noCrossRefs}</Muted> : null}
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.slice(0, n).map((row) => (
            <CrossRefItem key={rangeId(row.to)} row={row} meta={meta} translation={translation} />
          ))}
        </ul>
      ) : null}
      {rows.length > n ? (
        <Button icon="chevronDown" onClick={() => setShownFor({ rid, n: n + CROSSREF_PAGE })}>
          {SL.showMore}
        </Button>
      ) : null}
      <p className="text-[15px] text-muted">{SL.crossRefsAttribution}</p>
      <a href={OPENBIBLE_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <span>{SL.crossRefsLink}</span>
        <span className="sr-only">{SL.opensNewTab}</span>
      </a>
    </>
  );
}

function CrossRefItem({ row, meta, translation }: { row: CrossRefRow; meta?: BibleMeta; translation: TranslationId }) {
  const verses = useAsync(rangeId(row.to), () => getRangeVerses("BSB", row.to, { skipEmpty: true }));
  return (
    <li className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <Link href={readerHref(row.to.start, translation)} className={cx(linkClass, "-ml-3 self-start text-[18px]")}>
        {formatRange(row.to, meta)}
      </Link>
      <Status loading={verses.loading} error={verses.error} />
      {verses.data ? (
        <p className="reading">
          {verses.data.map((v) => (
            <span key={v.key}>
              <sup className="mr-0.5 font-sans text-[13px] font-bold text-muted">{v.ref.verse}</sup>
              <span>{v.text}</span>{" "}
            </span>
          ))}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-muted">
        <span className="font-semibold">{SL.crossRefsFrom}</span>
        {row.from.map((k) => (
          <span key={k}>{formatRef(fromKey(k))}</span>
        ))}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------- 5 / 6 user content

function NoteItem({ note, book, meta }: { note: UserNote; book?: BookPlan; meta?: BibleMeta }) {
  const bookParts = [book?.title, book?.author, book?.edition, note.page ? pageLabel(note.page) : undefined].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
  return (
    <li className="bordered flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <p className="flex flex-wrap items-center gap-2">
        <Tag>{SL.fromMyReadingTag}</Tag>
        <Tag>{SL.enteredByMe}</Tag>
        <span className="text-[15px] font-bold text-muted">{note.kind === "quote" ? SL.quote : SL.note}</span>
      </p>
      {note.kind === "quote" ? (
        <blockquote className="reading whitespace-pre-wrap border-l-4 border-border pl-3">{note.text}</blockquote>
      ) : (
        <p className="reading whitespace-pre-wrap">{note.text}</p>
      )}
      {bookParts.length ? (
        <p className="flex flex-wrap items-center text-[15px]">
          {bookParts.map((s, i) => (
            <span key={i} className="flex items-center">
              {i > 0 ? (
                <span aria-hidden="true" className="px-1.5 text-muted">
                  {SL.separator}
                </span>
              ) : null}
              <span>{s}</span>
            </span>
          ))}
        </p>
      ) : null}
      {note.verseRanges.length ? <p className="text-[15px] font-semibold text-muted">{formatRanges(note.verseRanges, meta)}</p> : null}
    </li>
  );
}

function ExternalTitle({ url, title }: { url: string; title: string }) {
  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer" className={cx(linkClass, "-ml-3 self-start text-[18px]")}>
        <span>{title}</span>
        <Icon name="external" size={18} />
        <span className="sr-only">{SL.opensNewTab}</span>
      </a>
      <span className="break-all text-[14px] text-muted">{url}</span>
    </>
  );
}

function LinkItem({ link }: { link: LinkOut }) {
  return (
    <li className="bordered flex flex-col gap-1 rounded-2xl bg-surface p-4">
      <ExternalTitle url={link.url} title={link.title} />
      <p className="flex flex-wrap items-center gap-x-2 text-[15px]">
        <span className="font-semibold">{SL.statedReference}</span>
        <span>{link.statedReference}</span>
      </p>
      {link.referenceEnteredByMe ? (
        <p>
          <Tag>{SL.referenceEnteredByMe}</Tag>
        </p>
      ) : null}
    </li>
  );
}
