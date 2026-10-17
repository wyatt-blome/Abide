# Abide architecture and module contracts

This file is the shared contract between modules. Code reads like this file says.

## Hard rule (overrides everything)
No context, commentary, theology, intro, outline heading, summary or quote is ever typed by a
developer. Content reaches the app only through `scripts/build-bible.ts` (BSB headings) and
`scripts/build-library.ts` (excerpts), both verified at build time by `scripts/verify-excerpts.ts`.
UI labels/instructions are fine. Test fixtures for parsers use **structural placeholder text**
(e.g. "Lorem ipsum ...") unless cut by `scripts/make-fixtures.ts` from a real cached source file.

## Network note (sandbox)
The build sandbox can reach only GitHub + npm. Scripts are written against the URLs in the spec,
with an ordered `mirrors` list per source. Mirrors used are recorded in `DECISIONS.md` and in
`library/sources.lock.json` (the exact URL fetched + sha256).

## Directory layout
```
src/config.ts                 APP_NAME (only place the name is written)
src/db/types.ts               data model (shared contract)
src/db/db.ts                  Dexie schema (AbideDB), table names per spec + libraryCache
src/db/repo.ts                small CRUD helpers that stamp updatedAt, derive verseKeys
src/lib/books.ts              66-book table (codes, OSIS, names, aliases)
src/lib/refs.ts               VerseKey/VerseRef/VerseRange helpers + reference parsing/formatting
src/lib/bible.ts              client loader for public/bible/** (meta, chapters, headings) w/ in-memory cache
src/lib/meta.ts               pure helpers over BibleMeta (verse iteration, counts, empty verses)
src/lib/text.ts               tokenization (words), normalization (shared by scoring & drills)
src/lib/scoring.ts            normalize, word alignment (Levenshtein), accuracy, grade
src/lib/srs.ts                FSRS-4.5-lite review(state, grade, now) → state
src/lib/chunking.ts           passage → daily chunks (1–3 verses, heading-aware)
src/lib/queue.ts              daily queue builder, new-chunk introduction, pace, auto-pause > 40 due
src/lib/streak.ts             streak update (queue cleared or ≥10 reviews; grace day doesn't break)
src/lib/planGen.ts            312-day reading plan generator (canonical/chronological/blended)
src/lib/missed.ts             missed-day policies (graceDay/spread/shiftEnd), never rewrites done days
src/lib/books-track.ts        book pacing over 6-day weeks
src/lib/ics.ts                daily .ics with RRULE + VALARM
src/lib/backup.ts             export/import (zod), merge by updatedAt
src/lib/seeded.ts             seeded PRNG (mulberry32) for Progressive Hide
src/lib/tts.ts                speechSynthesis wrapper (rate, voice, boundary events)
src/lib/speech.ts             webkitSpeechRecognition wrapper + isSupported()
src/lib/library.ts            client loader for public/library/** (index, shards), filtering by range
src/lib/sources.ts            assemble Sources panel data for a VerseRange (pure given loaded data)
content/starters.ts           starter memory plans: IDs + ranges only
content/plans/chronological.ts chronological reading order: ranges only
content/links.ts              official free pages per author: titles + URLs only
content/bibleproject.ts       BibleProject slugs per book: IDs/URLs only
content/classics.ts           bundled classics: IDs + URLs only
scripts/build-bible.ts        → public/bible/{bsb,web,kjv}/{BOOK}.json, meta.json, bsb/headings.json
scripts/build-library.ts      → public/library/index.json, public/library/{packId}/{BOOK}.json, library/sources.lock.json
scripts/verify-excerpts.ts    prebuild verifier
scripts/check-links.ts        HEAD/GET every source URL in manifests + lockfile
scripts/parsers/*.ts          generic parsers (pure: (rawText, options, ctx) → ParsedExcerpt[])
scripts/lib/*.ts              shared script helpers (fetch w/ mirrors, cache, sha256, normalize)
library/packs/*.json          pack manifests (+ README.md)
library/sources.lock.json     committed lockfile
src/app/**                    Next App Router pages (all client-rendered UI over Dexie)
src/components/**             UI components
tests/**                      Vitest tests (*.test.ts / *.test.tsx)
```

## Generated data formats
- `public/bible/meta.json`:
  `{ books: [{ code, name, chapters: number, verses: number[] /* verses per chapter */ }], totalVerses: 31102,
     emptyVerses: { BSB: VerseKey[] } }`
- `public/bible/{bsb|web|kjv}/{BOOK}.json`: `{ "1": ["v1 text", "v2 text", ...], ... }` (index 0 = verse 1;
  empty string = no text in that translation).
- `public/bible/bsb/headings.json`: `BsbHeading[]` in canonical order.
- `public/library/index.json`: `{ generatedAt, works: SourceWork[], books: Record<packId, BookCode[]> }`
- `public/library/{packId}/{BOOK}.json`: `{ workId, book, excerpts: Excerpt[] }`
  (cross-refs pack: `{ workId, book, crossrefs: CrossRef[] }`).
- Book intro excerpts (Henry) carry `isBookIntro: true` and a whole-book verseRange.

## Key function signatures
```ts
// refs.ts
toKey(ref: VerseRef): VerseKey; fromKey(key: VerseKey): VerseRef;
compareRefs(a, b): number; rangeContains(r, ref): boolean; rangesOverlap(a, b): boolean;
rangeSize(r, meta): number;        // number of verses (BSB versification)
formatRef(ref) / formatRange(range): string    // "Romans 8:28", "John 1:1–18", "Matthew 5–7"
parseReference(input: string): VerseRange[] | null  // user-typed "Rom 8:28-30; Ps 23"
// meta.ts
iterateRange(meta, range): VerseRef[]; isEmptyVerse(meta, key): boolean
// scoring.ts
normalizeWords(text): string[]; align(target: string[], attempt: string[]): AlignmentOp[];
score(target: string, attempt: string, peeks?: number): { accuracy, grade, ops }
// srs.ts
newState(now): SrsState; review(state: SrsState, grade: 1|2|3|4|5, now: number): SrsState
// chunking.ts
chunkPassage(verses: { key, text }[], headingStarts: Set<VerseKey>, size = 2): VerseKey[][]
// planGen.ts
generatePlan(opts: { style, startDate, graceWeekday, meta, headings, chronological }): ReadingDay[] (portions w/o ids ok)
```

## UI conventions
- Client components over Dexie (`useLiveQuery`). All pages under `src/app/` are `"use client"` where they touch Dexie.
- 5-tab bottom bar: Today `/`, Memorize `/memorize`, Read `/read`, Library `/library`, Settings `/settings`.
  Progress `/progress`, Hands-Free `/hands-free`.
- Primary actions in a bottom sticky bar (`<ActionBar>`), nothing essential in top 25%.
- Tap targets ≥ 48px; ✓/✗ icons with color, never color alone; `prefers-reduced-motion` honored.
- Themes via `data-theme` on `<html>`: light / dark / sunlight (high contrast); system default.
- Text: serif 20px base × fontScale (1.0–2.0), line-height 1.6.
