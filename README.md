# Abide

A local-first PWA for memorizing long Scripture passages, reading the Bible in a year (312 reading
days), and seeing what Christian writers wrote about a passage, with every word traceable to a
downloaded source file. No accounts, no backend, no analytics, no paid APIs.

**Renaming the app is one line:** change `APP_NAME` in `src/config.ts`. The page title, manifest,
headers, `.ics` and backup filenames all read it. Run `npx tsx scripts/make-icons.ts` afterwards
to regenerate the icons, which use the name's first letter. The IndexedDB name stays fixed, so
on-device data survives a rename.

## The content rule

The app shows no developer-written theology, commentary, summaries, headings or quotes. Context
reaches the app only through two scripts:

- `scripts/build-bible.ts` parses the BSB headings (`\s1 \s2 \ms \d`) from the BSB USFM.
- `scripts/build-library.ts` cuts verbatim excerpts from downloaded source files.

Excerpts map to verses only through the work's own citations, headings, index or proof texts,
parsed by regex. Ambiguous citations are dropped and logged in `library-build.log`.

`prebuild` runs three steps, and any failure fails the build:

1. **`scripts/verify-excerpts.ts`**
   - Re-reads every cached source file. If the cache is missing, it re-downloads from `library/sources.lock.json` and checks each file's sha256.
   - Normalizes whitespace only.
   - Asserts every excerpt occurs verbatim at its stored offset and that `sha256(text)` equals its `verbatimHash`.
   - Checks the five citation fields, the length limits, the sentence-boundary cuts and the shard counts.
   - Rebuilds the cross-reference rows from the source file.
   - Names the offending IDs on failure.
2. **`scripts/lint-content.ts`**, the same checks as the Vitest lint guard:
   - fails on any string over 160 characters in `src/` or `content/`, including concatenations and JSX text runs;
   - fails on anything in `content/` that isn't IDs, URLs, ranges, settings or short titles;
   - fails on pack display fields that aren't short labels.
3. **`scripts/sync-pack-readme.ts`** copies `library/packs/README.md` into `public/library/` for the Library tab.

## Quick start

```bash
npm install
npm run build:bible      # downloads text, writes public/bible/** (committed)
npm run build:library    # downloads sources, writes public/library/** + library/sources.lock.json (committed)
npm test                 # Vitest
npm run build            # prebuild (verify + lint) then next build --webpack
npm start                # then check offline mode in DevTools → Application
```

Other scripts:
- `npm run verify`
- `npm run check-links`
- `npm run build:library -- --include-large` builds the ⬇ opt-in packs.
- `npm run build:library -- --only=henry-commentary` builds one pack.

The app uses Next.js 16 with the webpack builder, because Serwist's service worker plugin needs webpack.

## Deploy to Vercel (Hobby, $0)

1. Push the repo to GitHub. `public/bible`, `public/library` and `library/sources.lock.json` are committed.
2. In vercel.com, choose Add New Project and import the repo. Use the defaults; no environment variables are needed.
3. `prebuild` runs on Vercel too. `.cache/sources` doesn't exist there, so the verifier re-downloads every file in the lockfile and checks its sha256 before verifying the excerpts. A network or hash failure fails the deploy.
4. Open the URL on your phone, then use Add to Home Screen (iPhone, Safari Share menu) or Install app (Android, Chrome). Each push redeploys, and the app shows "Update available".

## How this build was produced, and what's missing

This repository was generated in a sandbox that could reach only GitHub and npm. ebible.org,
ccel.org, gutenberg.org, archive.org, openbible.info and bibleproject.com were all blocked.

- **Bible text** came from faithful GitHub copies of the same public-domain files (table below). The exact URLs and hashes are in `public/bible/sources.json`.
- **Context Library:** 6 packs were built and verified (596 excerpts, 99,573 cross-references). Manifests for all 51 works in the spec are written. The other 45 packs were not built, because their sources couldn't be downloaded here.
- **To build the rest,** run `npm run build:library` on a machine with normal internet, then check `library/build-report.json` and `library-build.log`. Commit `public/library` and the lockfile.
- **Parser rules are untested on real files.** The heading and citation rules for those 45 packs follow each edition's known layout but haven't been run against the real files. A pack whose rules find nothing is skipped with "parser produced no mapped excerpts"; it is never shipped empty or wrong.

Until then, these acceptance checks can't be demonstrated in this build:
- Henry book introductions
- Romans 8 showing Henry, Calvin, Chrysostom and Owen
- Psalm 23 showing the Treasury of David and Augustine
- John 1 showing the Tractates and Chrysostom
- Galatians 2:20 showing Luther
- Wesley on every NT verse
- John 15:4–5 showing *Abide in Christ*
- Matthew 5 showing Ryle

Their manifests, parsers and parser tests are in place.

### Bible text sources

| Translation | Primary source (spec) | Used in this build | License |
|---|---|---|---|
| BSB text | scrollmapper `BSB.json` | same | Public domain (2023) |
| BSB headings | ebible.org `engbsb_usfm.zip` | `github.com/usfm-bible/examples.bsb` USFM | Public domain |
| WEB | ebible.org `engwebp_vpl.zip` | `github.com/seven1m/open-bibles` `eng-web.usfx.xml` | Public domain |
| KJV | ebible.org `eng-kjv_vpl.zip` | scrollmapper `KJV.json` (66 books only) | Public domain |

The totals are asserted by the build: 31,102 verse slots (31,086 with text, 16 empty in the BSB) and 3,216 BSB headings. Known differences between the mirror copies and the primary files are listed in DECISIONS.md under "Bible text". For example, the mirror USFM lacks PSA 106:42 and LAM 2:1, so any heading at LAM 2:1 is missing until the build is re-run against ebible.org.

### Context Library packs

★ = on by default; ⬇ = large, opt-in. Default-on packs that are built total 16.1 MB, and the build enforces a limit of under 50 MB.

**Built and verified:**

| Pack | Author · Work | Era | Size | Mapping | License |
|---|---|---|---|---|---|
| heidelberg-catechism ★ | Zacharias Ursinus · Heidelberg Catechism | Med. & Ref. | 0.71 MB | proof texts | Public Domain (Creeds.json) |
| westminster-confession ★ | Westminster Assembly · WCF | Puritan & 18th c. | 1.25 MB | proof texts | Public Domain (Creeds.json) |
| westminster-larger-catechism ★ | Westminster Assembly · WLC | Puritan & 18th c. | 2.19 MB | proof texts | Public Domain (Creeds.json) |
| belgic-confession | Guido de Bres · Belgic Confession | Med. & Ref. | 0.29 MB | inline citations | Public Domain (Creeds.json) |
| canons-of-dort | Synod of Dort · Canons of Dort | Med. & Ref. | 0.13 MB | inline citations | Public Domain (Creeds.json) |
| openbible ★ | OpenBible.info · Cross References | — | 12.75 MB | verse → refs | CC BY |

Creeds.json and the scrollmapper copy of the OpenBible data are pinned to commit SHAs. The OpenBible
data is trimmed to rows with at least 3 votes, keeping the top 5 per verse; see DECISIONS.md.

**Packs not built (dropped by a failed check):**
- **Source unreachable in the build sandbox:** Augustine (City of God, Confessions, Tractates on John, Expositions on the Psalms), Chrysostom (Homilies on Matthew, Romans, John), Justin Martyr, Irenaeus, Athanasius, Ambrose, Luther (Galatians, Preface to Romans, Large and Small Catechism, Table Talk), Calvin (Commentaries, Institutes), Matthew Henry ★, Owen, Watson, Baxter (×2), Bunyan (×2), Wesley Notes ★ and Sermons, Edwards, Butler, Paley, Pascal, Spurgeon Treasury of David ★ and Morning and Evening ★, Ryle (×2), Hodge (×2), Murray (School of Prayer, *Abide in Christ* ★), and Machen.
- **Large ⬇ packs, built only with `--include-large`:** Gill, Spurgeon Sermons, Adam Clarke, Jamieson-Fausset-Brown, and Barnes.

The current status of every pack is in `library/build-report.json` and in the in-app Library manager.

## Attribution

- Berean Standard Bible (public domain).
- World English Bible (public domain).
- King James Version (public domain).
- Cross-references: OpenBible.info, CC BY, which credits the Treasury of Scripture Knowledge as its main source.
- Creeds and catechisms: Creeds.json (NonlinearFruit), public domain.
- When built: CCEL texts (public domain), Project Gutenberg (public domain in the USA), and archive.org (Public Domain Mark).

## More

- `ARCHITECTURE.md`: module layout and data formats.
- `DECISIONS.md`: every default chosen where the spec was silent.
- `library/packs/README.md`: how to add a pack.
