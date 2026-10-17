# Decisions log

Defaults chosen where the spec was silent. Newest sections are appended by each build phase.

## Environment / sources
- **Build sandbox network.** The environment that generated this repo could reach only GitHub and npm.
  ebible.org, ccel.org, gutenberg.org, archive.org, openbible.info and bibleproject.com were blocked (HTTP 403 at the proxy).
  Every script is written against the spec's URLs and tries them first; for sources that have a faithful GitHub mirror,
  an ordered `mirrors` list is tried next and the URL actually fetched is written to the lockfile.
  Packs whose sources could not be fetched are **not built** and are listed in README "Packs not built".
  They build unchanged with `npm run build:library` on a machine with normal internet.
- **Mirrors used** (public domain / CC BY data, unchanged files):
  - BSB USFM (headings): `https://raw.githubusercontent.com/usfm-bible/examples.bsb/main/{NN}{BOOK}BSB.usfm`.
  - WEB: `https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-web.usfx.xml` (Public Domain per that repo's README).
  - KJV: `https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json`.
  - OpenBible cross-references: `https://raw.githubusercontent.com/scrollmapper/bible_databases/master/sources/extras/cross_references.txt`
    (header line `#www.openbible.info CC-BY 2024-11-04`).

## Bible text
Built by `npm run build:bible` (`scripts/build-bible.ts`, helpers in `scripts/bible/`). Raw downloads are cached in
`.cache/sources/bible/` (gitignored); `public/bible/sources.json` records the URL actually fetched + sha256 of every raw file.
- **URLs used in this build** (spec primaries on ebible.org returned 403 at the sandbox proxy, so the mirrors were used):
  - BSB verse text: `https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json` (spec source).
  - BSB headings: primary `https://ebible.org/Scriptures/engbsb_usfm.zip` (403) → mirror
    `https://raw.githubusercontent.com/usfm-bible/examples.bsb/main/{NN}{BOOK}BSB.usfm`. Numbering is Paratext style:
    OT `01GEN`…`39MAL`, NT `41MAT`…`67REV` (`40MAT`, `02GEN`-style guesses 404; `41MAT`, `67REV` exist).
  - WEB: primary `https://ebible.org/Scriptures/engwebp_vpl.zip` (403) → `https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-web.usfx.xml`.
  - KJV: primary `https://ebible.org/Scriptures/eng-kjv_vpl.zip` (403) → `https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json`.
  - License lines in `sources.json` are the rows of `https://raw.githubusercontent.com/seven1m/open-bibles/master/README.md`
    (all three "Public Domain"), copied from the downloaded file, not typed.
  - On a machine that reaches ebible.org the zips are used instead (VPL / USFM parsers are implemented; nothing else changes).
- **BSB JSON findings.** 66 books named in English with Roman numerals ("I Samuel", "III John", "Revelation of John");
  mapped to USFM codes via `src/lib/books.ts`. No markup (no `\`, `<>`, `[]`, `{}`; only curly quotes/dashes). All 31,102
  verse slots are present; the 16 verses the BSB omits are present as `""` — no slots needed inserting. The BSB USFM omits
  those verses entirely (their text is only in a footnote, e.g. MAT 17:20 note), so they stay empty.
- **Totals (asserted by the build; data agreed with the spec):** 31,102 verses; 31,086 non-empty; 16 empty (exact spec list);
  PSA 2,461 + PRO 915 = 3,376; NT 7,957; rest of OT 19,769. These spec numbers count verse *slots* (empties included in NT);
  NT non-empty = 7,941.
- **Psalm superscriptions.** The BSB JSON prepends the superscription to verse 1 ("…of David. The LORD is my shepherd…");
  the USFM keeps it as a separate `\d` line. When a `\d` heading sits on verse 1 and the JSON verse 1 starts with exactly that
  text (apostrophe U+02BC/U+2019 treated as equal), the prefix is removed from the verse text, so it is shown once (as the `d`
  heading) and is not part of what is memorized. 116 superscriptions moved; 0 `\d` lines failed to match. KJV verse text is
  left as the source has it (its superscriptions stay inside verse 1; there is no KJV heading source to split them reliably).
- **Headings** (`public/bible/bsb/headings.json`, 3,216 entries: s1 3,015 · s2 80 · ms 5 · d 116). `\s`/`\s1`→s1, `\s2`→s2,
  `\ms`/`\ms1`→ms, `\d`→d; `\r`, `\mr`, `\qa` (Ps 119 acrostic letters), `\s3+` skipped. A heading's verse is the next `\v`
  after it. Footnotes/cross-refs and character markers are stripped; otherwise the text is exactly the USFM's (including its
  U+02BC apostrophes). The one `\d` with no following verse (Hab 3:19 subscription, after the last verse) is dropped.
- **Mirror USFM defects (logged, not fatal).** The usfm-bible mirror is a different BSB revision from the JSON: 974 of 31,084
  comparable verses differ in wording/case (e.g. GEN 3:4), and a few lines are broken (GEN 2:4, GEN 10:25). It lacks
  PSA 106:42 and LAM 2:1 entirely, so any heading the BSB prints at LAM 2:1 is missing from this build. Verse text always
  comes from the JSON; only headings come from the USFM. The open-bibles `eng-bsb.usfx.xml` was *not* used for headings
  because it is the older "Berean Study Bible" edition.
- **WEB (USFX) parsing.** Text is taken between `<v id/>` and `<ve/>`; `<f>`, `<x>`, `<s>`, `<d>`, `<vp>`, titles and heading
  paragraphs are dropped; `<w>`, `<wj>`, `<add>`, `<qs>` keep their text; whitespace collapsed. Deuterocanon/front matter
  (FRT TOB JDT ESG WIS SIR BAR LJE S3Y SUS BEL 1MA 2MA 1ES MAN PS2 3MA 2ES 4MA GLO) is skipped.
  Mapping to the BSB grid: 2 slots missing (ROM 16:26–27) and 3 verses dropped (ROM 14:24–26: the WEB places the doxology
  there); 5 slots empty in the WEB itself (LUK 17:36, ACT 8:37, 15:34, 24:7, ROM 16:25). Psalm superscriptions are `<d>` in
  the WEB and are not part of verse text.
- **KJV (scrollmapper JSON).** No Strong's numbers or tags present. One bracketed word (1 JN 2:23 "[but]", translators'
  supplied words) → brackets removed, word kept. Ps 119 stanza labels ("<Hebrew letter> ALEPH." etc., 22 verses) removed
  from verse text. 0 mapping mismatches against the BSB grid. No apocrypha in the source.
- **Outputs** are compact JSON: `public/bible/{bsb,web,kjv}/{BOOK}.json` (≈4.2 MB, 4.1 MB, 4.2 MB per translation incl.
  BSB headings 0.27 MB), `meta.json`, `sources.json`.
- **Client loader** (`src/lib/bible.ts`) fetches `/bible/...` relative URLs and memoizes one promise per file;
  `configureBible({ fetchJson })` lets tests read the files from disk. `src/lib/meta.ts` is pure; `iterateRange` clamps 999
  sentinels and includes empty slots unless `skipEmpty`.

## App shell / PWA
- **Config.** `cacheComponents` and `partialPrefetching` are off: the app is client-rendered over IndexedDB, so every
  route prerenders to a plain static HTML shell. Builds use webpack (`next build --webpack`) because `@serwist/next`
  does not support Turbopack. Tailwind v4 runs under webpack through the already-installed `@tailwindcss/turbopack`
  loader as a pre-loader matched by `resource` (a top-level rule with `test: /\.css$/` makes Next disable built-in CSS),
  so no `@tailwindcss/postcss` dependency was added. `images.unoptimized` (no image server offline).
- **Service worker** (`src/app/sw.ts` → `public/sw.js`, disabled in dev). Precached: Next build assets, the HTML of
  every static route (found by scanning `src/app/**/page.tsx` at build; dynamic `[x]` segments are skipped — use query
  params for per-item screens), the manifest, icons, favicon, `/bible/meta.json`, `/bible/bsb/headings.json`,
  `/library/index.json`. Navigations with a query (`/read?...`) fall back offline to the precached route shell.
- **Bible offline.** Book files (`/bible/{bsb,web,kjv}/*.json`, ~13 MB) are cache-first at runtime, not precached, so
  a dropped connection during install cannot block the whole app shell from installing. After the first load the client
  fetches every book file not yet in Cache Storage (resumable on later loads). The runtime cache name carries a hash
  of `public/bible` (the precache revision of `meta.json`); a rebuilt dataset gets a fresh cache, old ones are deleted
  on activate.
- **Library.** Shards are cache-first in a cache keyed by a hash of `public/library`. The warm-up fetches packs in
  `settings.enabledPacks` (or, while that is empty, packs flagged `defaultEnabled`), never `largePack` ones — those are
  cached when the library code fetches them.
- **ESV** API responses are never cached by the service worker.
- **Updates.** A new worker waits. `UpdateBanner` ("Update available" / "Update") posts SKIP_WAITING
  (`messageSkipWaiting`) and reloads on `controllerchange`. `reloadOnOnline` is off so regaining signal never reloads
  mid-session. The app checks for a new worker when it returns to the foreground (at most hourly).
- **Theme.** `data-theme` on `<html>` (system/light/dark/sunlight), `.hands-free` for true black; theme and font
  scale are mirrored to localStorage and applied by a tiny pre-paint script to avoid a flash. System fonts only
  (serif for reading text, system sans for UI); no web fonts.
- **Icons** are generated by `scripts/make-icons.ts` (pure Node PNG/ICO encoder) from APP_NAME's first letter.

## Logic defaults
- **SRS (src/lib/srs.ts).** FSRS-4.5 with the published default weights
  `[0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755]`
  (ts-fsrs 3.x / py-fsrs 2.x defaults), DECAY −0.5, FACTOR 19/81, request retention 0.9. Grade map 1→Again, 2→Hard,
  3–4→Good, 5→Easy. Mean reversion toward D0(Good). Lapse stability is clamped to ≤ the previous stability (as FSRS-5 does).
  Passing grades: due = now + round(interval) days, minimum 1 day, maximum 100 years. Again: due = now + 10 min, so it stays in
  today's queue. Lapses count only for cards already learned (reps > 0). Same-day re-reviews leave stability unchanged (R = 1).
- **"Due today"** = due ≤ end of the local day; "overdue" = due before local midnight today.
- **Queue (src/lib/queue.ts).** Order: overdue (oldest first) → due today (plan order, then passage order) → passage runs → new chunks.
  Time estimate: 25 s per verse review; 60 s per new chunk + 6 s per verse of its run-through; 6 s per verse of a passage run;
  rounded up to whole minutes. Paused plans are left out of the queue entirely.
- **New chunks.** VerseCards are created lazily when a chunk is introduced (`repo.introduceDueChunks`), not when the plan is made.
  Pace: daily = 1/day; everyOtherDay = 1 when ≥ 2 calendar days since the last introduction; twicePerDay = 2 introduced together
  in the day's batch. No new chunk while the plan still has unlearned (reps = 0) cards, while > 40 reviews are due (auto-pause),
  or past `settings.dailyNewLimit` (default 3) across plans. Cumulative build-up: chunk N is learned, then chunks 1..N are run through.
- **Passage cards.** Created when the last chunk of a multi-chunk plan is introduced, first due the next local day. A passage run
  grades the passage card with the rounded mean of the per-verse grades, capped at Hard when any verse got 1; each verse graded 1
  is also reviewed as Again on its own card. Other verses keep their own schedules.
- **Chunking (src/lib/chunking.ts).** BSB empty verses skipped; verses > 30 words stand alone; a verse that starts a BSB heading
  (levels s1/s2/ms; Psalm superscriptions "d" are not breaks) always begins a new chunk; each run between boundaries is split into
  ⌈n/size⌉ near-equal chunks, larger first (size 2, run of 5 → 2+2+1). Chunk size clamped to 1–3, default 2.
- **Scoring.** Words are normalized (quotes unified, lowercase, hyphens split words, digits spelled out without "and", e.g.
  153 → "one hundred fifty three"), aligned by word-level edit distance with "match" = character similarity ≥ 0.8.
  Ties in the backtrace prefer match, then substitution, deletion, insertion. An empty target scores 1 only for an empty attempt.
- **Streak.** A day counts when the queue was cleared or ≥ 10 graded reviews were logged. Gaps made only of grace weekdays keep the
  streak; practising on the grace day still adds +1. `activeDates` keeps the latest 400 dates.
- **Reading plan (src/lib/planGen.ts).** Default style blended, start = next Monday, grace weekday Sunday, 7 verses/min.
  Tracks: blended = OT (OT minus Psalms/Proverbs), NT, PP (Psalms then Proverbs); canonical/chronological = one ALL track.
  Units never split: single verses, or a whole Psalm. Psalm 119 is a solo day in its track; it divides the track into segments
  whose day counts are apportioned by verse count. Daily cut: target = verses left ÷ days left in the segment; prefer a chapter end
  within ±25 %, then a BSB heading boundary within ±20 %, else the verse boundary closest to target. Blended balances the day
  total: PP and NT are cut first and the OT target absorbs their deviation (clamped to 25–200 % of the OT base target).
  Result with the BSB data: every day within 0.75–1.24 × the mean (99.6 verses), Psalm 119 day excepted.
  Portions are split wherever the track sequence is not canonically contiguous (e.g. OT jumping from Job to Ecclesiastes,
  or chronological jumps), so each portion range is a contiguous canonical run.
- **Chronological order (content/plans/chronological.ts).** Whole chapters only: Genesis 1–11, Job, Genesis 12–50, the Law, Psalm 90
  after Deuteronomy, Joshua–Ruth, 1 Samuel with the Psalms whose superscriptions name events in David's life placed beside them,
  1 Chronicles' genealogies and David's reign interleaved with 2 Samuel and the remaining Davidic/temple Psalms, Psalm 119 near the end
  of David's reign, Song/Proverbs/Ecclesiastes beside Solomon, Kings and Chronicles interleaved with the prophets at their kings
  (Obadiah, Joel, Jonah, Amos, Hosea, Isaiah, Micah, Nahum, Zephaniah, Jeremiah, Habakkuk, Ezekiel), Lamentations and Psalm 137
  after the fall of Jerusalem, Daniel, Ezra 1–4 with Psalm 126, Haggai, Zechariah, Ezra 5–6, Esther, Ezra 7–10, Nehemiah with the
  remaining Songs of Ascents, Malachi. NT: the four Gospels in order (no harmony), Acts with the letters inserted where they were
  written (James, Galatians, 1–2 Thessalonians, 1 Corinthians, 2 Corinthians, Romans, the prison letters, the pastorals,
  1 Peter, Hebrews, 2 Timothy, 2 Peter, Jude, 1–3 John), Revelation. Verified by test to cover every verse exactly once.
- **Missed days (src/lib/missed.ts).** Missed = date before today with an unread portion. Completed days are never rewritten.
  graceDay: unread portions move to catch-up days (dayIndex −1, id `${planId}:catchup:${date}`) on the next grace weekdays from
  today, 2 missed days per grace day. spread: unread verses are cut into equal shares appended as sub-range portions to the next
  12 reading days after today (today is untouched). shiftEnd: every not-done day from the first missed day on is re-dated
  sequentially from today (grace weekday and dates of completed days skipped). graceDay/spread remove the moved portions from the
  missed day so nothing is listed twice.
- **Books track.** Per-day amount = unitsPerDay if set, else ⌈remaining at start of today ÷ reading days left⌉ (recomputed daily);
  "on pace" = within one day's worth of the straight line from start to target over reading days.
- **.ics.** Floating local DTSTART (follows the device time zone), RRULE:FREQ=DAILY, 10-minute event, DISPLAY alarm at start,
  stable UID so re-importing replaces the event.
- **Backup.** All tables except libraryCache. Merge keeps the incoming copy only when its stamp (updatedAt ?? createdAt ?? at)
  is strictly newer; ties keep the local copy. Replace clears the backed-up tables first. Unknown tables in a file are ignored.
- **Dexie database name** is a fixed constant (not derived from APP_NAME) so a rename does not orphan on-device data.
- **Reference parsing without meta** uses the sentinel 999 for "end of chapter/book" (`refs.END`), resolved by `clampRange(meta, r)`;
  with meta the parser validates and resolves ranges itself.
