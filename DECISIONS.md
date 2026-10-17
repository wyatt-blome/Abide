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
