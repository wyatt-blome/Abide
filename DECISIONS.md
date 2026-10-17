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

## Context Library
- **Verbatim definition.** An excerpt is valid iff `normalizeWs(source).startsWith(text, charOffset)`, where
  `normalizeWs` only joins line-wrap hyphenation before a lowercase letter (`exam-\nple` → `example`) and collapses
  whitespace runs to one space (`scripts/lib/normalize.ts`). `charOffset` is a UTF-16 index into that normalized text of
  raw file `rawIndex`. Build and verifier share `scripts/lib/verify-core.ts`; the build self-checks before writing.
- **JSON sources (Creeds.json).** Offsets into the JSON file text are meaningless because of escapes, so excerpts carry
  `sourcePaths` (`Data.0.Question`, `Data.0.Answer`) and `partOffsets`; the verifier decodes the JSON and checks each
  part against `normalizeWs(field value)`. Q&A text = Question and Answer joined by `\n` (normalized values never
  contain a newline). The plain `Answer`/`Content` fields are used, not the `…WithProofs` variants with `[1]` markers.
- **HTML sources (Machen).** Source text = `htmlToText(raw)`: markup and comments removed, entities decoded, words
  untouched; excerpts carry `sourceTransform: "html-text"`.
- **Creeds.json license.** Each file's `Metadata.SourceAttribution` is `"Public Domain"`; `proofText` is the exact
  string `"SourceAttribution": "Public Domain"` as it appears in the raw file. (The repo README notes that some *other*
  creeds in that repo are copyrighted; none of those are used.)
- **Belgic Confession and Canons of Dort** have no proof-text fields but print citations inline ("(Rom. 3:19)"), so they
  are indexed by those citations (`mode: "inline"`), not listed-only. Not default-on.
- **Excerpt length.** ≤ 1,500 chars, cut at the original's sentence boundaries (abbreviations, roman numerals after a
  book abbreviation, and "ver. 5" are not boundaries). A single sentence longer than the limit is cut at a space and
  flagged. Full sections (`fullSection: true`, ≤ 12,000 chars or the pack's `sectionMaxChars`) back "Read full section"
  via `sectionId`; Henry uses 3,000 to stay inside the default-on budget.
- **Shard ranges.** An excerpt citing proofs in many books is stored in each book's shard, but each copy lists only the
  `verseRanges` that touch that book (WLC shrank from 6.2 MB to 2.1 MB). Text, id and hash are identical across copies;
  the verifier checks copies agree.
- **Stable ids.** `{packId}:{hash8}` with hash8 = sha256 of `rawIndex|sourcePaths|charOffset|length|section flag`, so
  ids survive rebuilds of an unchanged source. `verbatimHash` = sha256(text) hex.
- **OpenBible budget.** Rows with ≥ 3 votes, at most the 5 highest-voted per "from" verse (99,573 rows, 26,194 verses,
  12.2 MB). All rows ≥ 3 votes would be 24.9 MB, half the default-on budget before Henry is added.
  Shards sorted by votes desc. The zip primary is unpacked to its `.txt` (`scripts/lib/source-text.ts`).
- **Unreachable vs. rejected.** Network failure → pack skipped (exit 0, warning; `--strict` → exit 1). License proof not
  found in the fetched files/proof page, or no pre-1931 year for `published-before-1931` → pack rejected, exit 1 after
  the other packs are processed. If the proof page itself is unreachable the pack is skipped, not rejected.
- **`published-before-1931` proofText** identifies the edition (e.g. "Machen"); the license evidence is the year < 1931
  found in the source header (CCEL "Print Basis", "Copyright, 1923", imprint lines, or the pack's `yearPattern`).
- **Multi-author volumes** (ANF 1 → Justin Martyr, Irenaeus): one pack per author with `bodyStart`/`bodyEnd`; when given
  these must be found or parsing fails, so text is never attributed to the wrong author.
- **Calvin volume map.** Only calcom08 → Psalms and calcom38 → Romans are fixed; other volumes are mapped at build time
  from https://ccel.org/ccel/calvin, and volumes still unmapped are skipped (logged).
- **Augustine's Psalms numbering** is taken from the NPNF headings as printed; the manifest notes to confirm on the first
  real build that they use the English numbering.
- **Node + proxy.** Downloads spawn `curl` (honours `HTTPS_PROXY` and the CA bundle); without curl, undici's
  `EnvHttpProxyAgent`, then plain `fetch`. `check-links` classifies proxy refusals (403 on CONNECT, or the proxy's own
  403 JSON body for github.com pages) as "blocked", separate from real 404s.
- **Lint guard** (`tests/lint-guard.test.ts`): no literal > 160 chars in `src/` or `content/`; `content/` literals must
  look like a URL, id/slug, book code/verse key, reference, setting token or short title (≤ 80 chars, ≤ 12 words, no
  sentence punctuation or quotation marks).

## Memorize UI
- **Routes** (static, query params so the shells are precached): `/memorize`, `/memorize/new`, `/memorize/plan?id=`,
  `/memorize/practice?plan=&target=&mode=` (target `run` | `chunk:N` | `verse:KEY`), `/memorize/practice?queue=today`,
  `/hands-free?source=queue | ?plan= | ?plan=&loop=1&repeats=N&gap=S`, `/progress`. `useSearchParams` users sit in `<Suspense>`.
- **Maturity (src/lib/progress.ts).** new = no card or reps 0; learning = reps < 2, or the last review was an Again
  (scheduled interval < 1 day); mature = interval (due − lastReviewed) or FSRS stability ≥ 21 days; young = the rest.
  "Known" = young or mature. Mastered = every verse mature + last passage run graded ≥ 4 (single-chunk plans: every
  verse's last grade ≥ 4). After each recorded attempt an active, fully introduced plan that meets this is set to
  `status: "mastered"` (mastered plans still appear in the queue; only paused plans are left out).
- **Forecast** = current due dates only, bucketed by local day for 30 days; overdue counts on day 0; reps-0 cards excluded.
  Bible % read = distinct non-empty verses in done reading portions ÷ 31,086.
- **Recording.** Every finished drill records (Read & Listen is never graded). Verse/chunk targets → `recordVerseReview`
  per verse that has a card (verses of not-yet-introduced chunks are practised but not scheduled). Whole-passage target
  with a passage card → `recordPassageRun`. Cumulative run-through of a partly introduced plan (and the new-chunk
  run-through in the daily session) → only verses graded 1 are re-reviewed as Again; others keep their schedule,
  matching the passage-run rule. Assisted modes (Progressive Hide, First Letters) are capped at grade 4 (FSRS Good),
  since the text is on screen and accuracy is self-reported (1 − 0.03 per peek). Type First Letters accuracy =
  first-try words ÷ words − 0.03 per hint. Reference drill: a wrong reference pick caps that verse's accuracy at 0.919
  (grade ≤ 3). Multi-verse recall/speech attempts are aligned once and matches counted per verse.
- **Daily session.** The queue is snapshotted at the start (after `introduceDueChunks`); a new chunk is two steps
  (learn the chunk, default Read & Listen → then Type; then the cumulative run-through). At the end the queue is rebuilt
  and anything still due (Again cards) is offered as another round. The streak is recorded after every attempt when the
  queue is empty or ≥ 10 graded reviews were logged today.
- **Keyboard.** A–Z in alphabetical order, 3 rows × 9 (27th key = Hint), full-bleed, 64 px tall: the widest keys a phone
  allows (≈ 40 px on a 360 px screen; a QWERTY 10-key row would be ≈ 35 px). Physical keys work too ("?" = hint).
  Numbers: the first letter of the spoken word (40 → f). A word is revealed after 2 misses.
- **Story of the Passage** uses BSB headings of levels s1/s2/ms within the plan range (Psalm superscriptions, level d,
  are not section headings), captioned "Heading: Berean Standard Bible". Phase 2 (verses grouped under headings) is
  optional ("Finish here"). Without headings the UI shows "No BSB headings in this range" and offers no drill.
- **Ad hoc plan (src/lib/planActions.ts).** One plan with `starterId: "ad-hoc"` collects "Memorize this" ranges. New
  verses are appended as chunks (verses already in it are skipped; BSB empty verses skipped), its range grows to the
  union, its `startDate` moves to tomorrow (so the new verses start tomorrow; existing cards keep their schedules) and a
  mastered Ad hoc plan becomes active. "Its own plan" creates a separate plan starting tomorrow. New plans from
  `/memorize/new` default to today.
- **Translations for plans**: BSB / WEB / KJV (bundled, offline). ESV is not offered for memory plans (no offline text);
  a plan with ESV would read BSB text (`bundledTranslation`).
- **Hands-Free.** Per item: reference → pause (settings.handsFreePauseSec, adjustable 2–30 s) → verse → 1.2 s. "First
  half, I finish it": the first half of the words → pause → whole verse. Pause stops speech; Start resumes from the start
  of the current item. Listen loop: the plan's verses read N times through with S seconds between verses (no recite
  pause). Each fully read item with a card is logged with `recordHeard` (not graded). Media Session play/pause/next/prev
  + metadata; screen wake lock while playing. The TabBar is hidden by a small rule appended to globals.css
  (`:root.hands-free nav[aria-label="Main"]`), keyed on the class `useHandsFreeMode` already sets.
- **Heatmap** cells show the verse number plus a symbol and border style per state (○ dashed new, ◔ dotted learning,
  ◑ young, ● mature, — no text in BSB), so state never depends on color alone.

## Read / Books / Today UI
- **Routes** (all static; per-item screens use query params so the service worker precaches them):
  `/` Today, `/read`, `/read/days`, `/read/reader?book=PSA&chapter=23&t=BSB[&v=4][&listen=1]` or
  `/read/reader?day=<readingDayId>&portion=<i>`, `/read/books`, `/read/book?id=`, `/read/classic?id=[&s=]`.
  Each `page.tsx` is a server component (metadata) rendering a client screen from `src/components/reader/`;
  screens that call `useSearchParams` are wrapped in `<Suspense>`.
- **One reading plan at a time.** Creating a plan replaces the previous plan and its days. Day ids are
  `${planId}:${dayIndex}`. The wizard (inline on `/read` when there is no plan) defaults to Blended, Sunday grace day,
  next Monday, the settings translation; it also sets `settings.graceWeekday` to the plan's grace day so the streak,
  books track and plan share one grace day. Store layer: `src/lib/readingPlanStore.ts`.
- **Missed days.** With `missedPolicy === "ask"` and missed days, a Sheet asks once: Catch up on grace day / Spread over
  next 2 weeks / Shift end date. The choice is applied with `lib/missed.ts` and saved as the plan's `missedPolicy`; from
  then on it is applied automatically whenever days are missed (Read and Today screens). Closing the sheet without a
  choice hides it for the browser session only. Plan settings can change the policy (including back to "Ask me").
  Only days whose date or portions actually changed are written, so completed days are never rewritten.
- **Pace.** Behind = past days with unread portions; ahead = future plan days already complete; shown as
  "Ahead/Behind by N days". Projected finish = last scheduled date, pushed out by the days behind (reading days only).
  Estimated minutes = verses ÷ `settings.readingVersesPerMin`, rounded, at least 1. Before the start date the first day
  is shown so the reader can read ahead. On the grace day the Today/Read view lists catch-up days and missed days.
- **BSB headings.** Section headings (s1/s2/ms) are shown in their position for every translation, because WEB/KJV/ESV
  are displayed on the BSB verse grid and the headings are also the tap targets for Sources (a heading's section runs
  from its verse to the verse before the next s1/s2/ms heading, within the book). Psalm superscriptions (`d`) are shown
  only with BSB text: they are BSB wording, and the KJV keeps its own superscription inside verse 1. The Reader footer
  carries "Headings: Berean Standard Bible" whenever a heading is on screen. Empty slots show "(no text in BSB)" etc.
- **Reader interaction.** Each verse is a ≥ 48 px block (role=button, Enter/Space). Tap → action sheet (Memorize this,
  Sources, Add note, Add link, Listen from here, Select a range from here). Press and hold 500 ms marks a range start,
  then a tap on the last verse opens the actions for the range ("Select a range from here" is the keyboard/switch-access
  path). Swipe ≥ 70 px horizontally (|dx| > 2|dy|, < 800 ms) moves chapters in chapter mode. Portion mode shows only that
  portion, with "Mark read" in the ActionBar and a link to the day's next portion. The last chapter position is kept in
  localStorage (per-device convenience only).
- **Listen** (`components/reader/useSpeech.ts`) wraps `tts.speakSequence` with verse/paragraph and word highlighting,
  a Screen Wake Lock while speaking and Media Session play/pause/stop/next/previous. Pause cancels and Resume restarts
  the current verse (speechSynthesis.pause is unreliable on Android). In chapter mode the Reader continues into the next
  chapter when a chapter ends (`listen=1`; iOS may need a tap). Plan portions are preloaded so Listen speaks inside the
  tap (iOS gesture rule); when listening finishes, a toast offers "Mark read".
- **ESV** (`src/lib/esv.ts`). Off unless `esvEnabled` and a key. One request per chapter to
  `https://api.esv.org/v3/passage/text/` with `Authorization: Token <key>`, verse numbers on, headings, footnotes and
  passage references off, `include-copyright=true`. Kept only in a module-level Map for the session (never IndexedDB or
  Cache Storage; `cache: "no-store"`; the SW routes the host NetworkOnly); failed requests are not memoized. The
  notice under the text is the trailing copyright paragraph from the API response (or its short "(ESV)" form); if the
  response has none, the license label "Scripture quotations are from the ESV® Bible" is shown. Errors are UI labels
  with a "Read the BSB instead" button. ESV falls back to BSB when turned off.
- **Books track** (`src/lib/booksStore.ts`). Logging keeps one BookLog per book per day: saving "read through page N"
  replaces today's logs with one from the start-of-day position + 1 to N, so the day's assignment does not move while
  reading; going below the start of the day removes today's logs (a correction). Reaching the total marks the book
  finished. Each save prompts "Add a quote or note?" → AddNoteSheet with `bookId` and `page`. Default target: 8 weeks
  (start + 55 days). Off pace (behind): a fixed `unitsPerDay` can be dropped to recompute to the target date; otherwise
  the daily amount already self-corrects. "Move target to …" uses `proposeTarget` (the pace actually kept). Removing a
  book deletes its BookLogs; notes stay in My Library.
- **Bundled classics** (`content/classics.ts`, `src/lib/classics.ts`). Gutenberg texts use
  `https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt`; Abide in Christ uses the archive.org download URL of
  `abideinchrist01murr_djvu.txt` (shown with an "OCR text" label); Morning and Evening uses CCEL's
  `ccel/s/spurgeon/morneve/cache/morneve.txt` (the same cache-URL pattern as the library packs). Downloads are plain
  browser fetches; gutenberg.org, ccel.org and archive.org may block them by CORS and the app has no backend, so no
  same-origin proxy is provided: failure shows "Couldn't download this text. Check your connection." with Try again.
  Raw files are stored in Cache Storage (`abide-classics`, keyed by URL; memory fallback). Gutenberg header/footer are cut
  at the "*** START OF" / "*** END OF" lines. Sections start at heading lines that follow a blank line (CHAPTER / BOOK /
  PART / SECTION / STAGE + number or word, Chapter / Book / Part / Section + number, or a lone Roman numeral; ≤ 80 chars);
  sections with < 400 non-space characters merge into the next (contents lists, title pages); with < 3 headings the text
  is cut into ~12k-character "Part N"s. The BookPlan counts sections (`unit: "sections"`, total = section count, kept in
  step with the downloaded text); `current` is the reading position and "Mark read" advances it.
- **Morning and Evening** is date-locked: entries are found by their date heading lines ("Morning, January 1",
  "January 1st — Evening", or a date line followed within 4 lines by "Morning"/"Evening"); a date listed twice (contents)
  uses the entry with the most text. Only today's two entries are shown; its BookPlan has `dateLocked`, total 366, and
  counts one unit per day marked read. A date the edition lacks shows a UI label.
- **Today.** Cards: Memory review (`queue.buildQueue` + `formatSummary`; `introduceDueChunks` runs on open, idempotent),
  Bible reading (portions + Listen), Book reading (active books, quick "Read to p. N", Stepper, note prompt), Streak with
  week dots (✓ green done, ✗ red missed, – grace, ring today; each with an aria label), and a backup nudge when
  `lastBackupAt` (or, with no backup yet, the earliest plan's createdAt) is ≥ 14 days old, linking to `/settings#backup`.
  "Start review" (→ `/memorize/practice?queue=today`) is the ActionBar primary; Hands-Free → `/hands-free?source=queue`.

## Library / Sources / Settings UI
- **Sources panel** (`src/components/sources/SourcesPanel.tsx`, `SourcesSheet.tsx`). Sections: Outline → Book introduction →
  What others wrote → Cross-references → From my reading → Links. Every fixed string it can render lives in
  `src/components/sources/labels.ts` (`SOURCES_UI_LABELS`, plus the generated `vv. a–b` / `p. N` patterns);
  `tests/library-ui/sources-panel.test.tsx` walks every text node of the rendered panel for Romans 8 and fails on
  anything that is not a label, verbatim excerpt text (or a Q/A part), BSB heading/verse text, citation field value,
  formatted reference, or the user's own note.
- **Five-field citation.** `ExcerptCard` renders nothing unless author, work title, locator, edition and an http(s)
  `url` are all non-blank (`hasFullCitation`). The panel also filters with it, so empty states count only shown cards.
  Truncation ellipses are separate `aria-hidden` spans beside (never inside) the verbatim `<span data-verbatim>`, with an
  sr-only label. Creed Q&A (`sourcePaths` = `…Question`, `…Answer` and exactly one `\n`) shows "Q."/"A." UI labels;
  other excerpts split on `\n` into paragraphs. OCR works show the manifest's `ocrNote` (fallback label otherwise).
- **Outline.** Segments start at each BSB heading verse inside the range (headingsInRange); a leading run with no heading
  in the range is shown as plain verses. Single-chapter ranges use "vv. a–b", others a full reference. The drill link is
  `/memorize/practice?mode=headings&range=ROM.8.1-ROM.8.39` (URI-encoded), shown only when the range has a heading.
- **Book introduction** uses only `henry-commentary` excerpts with `isBookIntro` (the pack must be built and enabled);
  those are not repeated under "What others wrote". Intros from other packs stay in "What others wrote".
- **What others wrote.** Grouped in `ERA_ORDER`; within a group the order of `excerptsForRange` (most specific first) is
  kept. Type chips appear when more than one type is present; none selected = all. The Modern group shows only the
  pointer label when the user has notes/links for the passage (they are listed once, in sections 5/6).
- **Cross-references** appear only when the `openbible` pack is built and enabled. Rows with the same target range are
  merged (highest votes kept, all "from" verses listed), sorted by votes, 10 at a time ("Show more"). Target text is
  always BSB; the reader link carries the panel's translation (`&t=`). Votes are not shown.
- **Links.** BibleProject: only the verified slugs in `content/bibleproject.ts`, chosen by chapter span; books without one
  get the explore page. Link-outs show title + URL + stated reference (+ "reference entered by me"); author/site are
  stored but not shown in Sources.
- **Enabled packs.** `settings.enabledPacks = []` still means "defaults" (as the offline warm-up reads it). The first
  toggle materializes the defaults; switching every pack off stores the sentinel `"(none)"` (`NO_PACKS`,
  `src/lib/enabledPacks.ts`), which matches no pack, so the list never falls back to defaults by accident.
  Turning on a small pack calls `useOfflineStatus().rewarm()`; turning on a `largePack` fetches each of its shards through
  `loadShard` (service-worker cache + Dexie) with a progress line. Size is shown as "⬇ N MB" from `packSizeBytes`.
- **Pack summaries.** `scripts/sync-pack-readme.ts` (appended to `prebuild`) copies `library/packs/README.md` to
  `public/library/README.md` (rendered on /library/how-to-add by a small React-only Markdown renderer, no injected HTML)
  and writes `public/library/packs-summary.json` (descriptive manifest fields) so the manager can show author, edition,
  license evidence and source for packs that were not built. Both are regenerated on every build.
- **Author pages** (`content/links.ts`): titles + URLs only, never fetched. `pageStatesReference` defaults: Ligonier,
  BGEA and Philip Anthony Mitchell "varies"; Desiring God and Truth For Life `true` (their message pages list the
  passage). User-added pages are stored in the new optional `Settings.customAuthorPages` (so they are in backups).
- **Link-outs.** Save needs an http(s) URL, a title, the stated reference and ≥ 1 verse tag that the user confirmed with
  the "Confirm tags" checkbox; any change to the tags clears the confirmation. Tags may be prefilled from
  `parseReference(statedReference)` (on blur, or with a button) but are never saved unconfirmed. Site = URL hostname
  without `www.`. `repo.saveLinkOut` validates again.
- **Notes.** Text is required; book, page and verse tags are optional (an untagged note only shows in My Library).
  Notes always carry the "from my reading" and "entered by me" labels.
- **Settings.** Font scale 100–200 % in 10 % steps with a live preview of the name verse; TTS rate 0.6–1.4; hands-free
  pause 2–30 s; reading speed 3–20 verses/min; daily new chunks 1–10. ESV appears as a translation only when enabled
  with a key; switching ESV off while it is the translation falls back to BSB. The ESV key lives in the settings row, so
  it is included in exported backups (said in the UI).
- **Reminders.** `.ics` download (works everywhere) + local test notification (`registration.showNotification`).
  `src/lib/push.ts` `subscribePush()` is a deliberate no-op returning `{ ok: false, reason }`; the planned server path
  (VAPID keys + Vercel Cron + `web-push`) is documented in that file. iOS is reported as push-capable only when
  installed and ≥ 16.4.
- **Backup.** Export uses the share sheet when `navigator.canShare({ files })`, else a download named
  `backupFilename()`; `lastBackupAt` is set after a successful export (not when the share sheet is cancelled). Import
  previews per-table counts; Replace needs a second tap. "Clear all data" confirms in a sheet, then reloads.
- **About** reads John 15:4 from the bundled BSB (`APP_NAME_VERSE`), and lists source URLs from
  `public/bible/sources.json`, the library index (`sourcePage`) and `content/classics.ts`.
- **Sync.** `src/lib/sync.ts` defines `SyncAdapter` (push/pull/status) with a `NoopSyncAdapter`; nothing syncs yet.
