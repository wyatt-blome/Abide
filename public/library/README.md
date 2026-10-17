# Context Library packs

Every file here (except this README) is a **pack manifest**: one public-domain / CC BY work that
`npm run build:library` downloads, license-checks, cuts into verbatim excerpts and maps to verses.
The app never shows text that is not a verbatim slice of a downloaded file; `npm run verify`
(also run as `prebuild`) re-checks every excerpt against the raw file and fails the build otherwise.

## Running

```sh
npm run build:library                       # all packs except largePack ones
npm run build:library -- --only=heidelberg-catechism,openbible
npm run build:library -- --include-large    # also Gill, Clarke, JFB, Barnes, Spurgeon's sermons
npm run build:library -- --strict           # unreachable sources fail the build (exit 1)
npm run verify                              # re-check public/library/** against the sources
npm run check-links                         # HEAD/GET every URL; writes library/link-report.json
npx tsx scripts/make-fixtures.ts            # cut real snippets into tests/fixtures/real/
```

Outputs: `public/library/index.json`, `public/library/{packId}/{BOOK}.json`,
`library/sources.lock.json` (exact URL fetched + sha256 per raw file), `library/build-report.json`
(built / skipped / rejected with reasons and sizes) and `library-build.log` (every dropped or
ambiguous citation, skipped heading, license year found). Raw files are cached in
`.cache/sources/{packId}/{n}-{basename}` (git-ignored).

Exit codes: **1** if a fetched pack fails its license check, a manifest is invalid, the
default-on packs total 50 MB or more, or (`--strict`) any source is unreachable. Unreachable
sources are otherwise skipped with a warning (exit 0) and listed in `index.json.skipped`.

## Adding a pack

1. Create `library/packs/{id}.json` (file name = `id`).
2. Point `rawUrls` at the plain-text/JSON/HTML file(s), `sourcePage` at the human page.
3. Put the rights statement the source itself carries in `license.proofText`.
4. Choose a parser and give it `parserOptions` that match the work's real headings.
5. `npm run build:library -- --only={id}`, read `library-build.log` and `build-report.json`,
   then `npm run verify`. A pack whose parser yields no mapped excerpt is skipped, not shipped.
6. Optionally add a spec to `scripts/make-fixtures.ts` and run it to get a real test fixture.

Never type an excerpt, a summary or a heading into a manifest. Labels (`label` templates) are
built from the work's own heading text (`$1`) or from numbers; they are locators, not content.

## Fields

| field | meaning |
|---|---|
| `id` | lowercase slug, equals the file name; output directory `public/library/{id}/` |
| `author`, `title` | as printed by the source |
| `edition` | edition / translation statement, e.g. `NPNF1-02, trans. Marcus Dods (CCEL text)` |
| `era` | `early` · `medievalReformation` · `puritan18c` · `c19` · `c20early` · `modern` |
| `types` | `commentary` `sermon` `apologetics` `theology` `confession` `catechism` `devotional` `crossref`; the first is the excerpts' `type` |
| `rawUrls` | files to download, in order (`rawIndex` = position). `https://` only (`file://` is accepted for tests) |
| `mirrors` | optional, `mirrors[i]` = ordered fallback URLs for `rawUrls[i]`; the URL actually used is recorded in the lockfile |
| `sourcePage` | page shown as "source" (also the excerpt `url` unless `urlTemplate` applies) |
| `license.status` | `public-domain` or `CC-BY` |
| `license.basis` | `rights-statement` · `published-before-1931` · `pd-mark` · `cc-by` |
| `license.proofText` | must occur (after whitespace normalization) in a raw file, else in the fetched `proofUrl` page |
| `license.proofUrl` | page holding the rights statement (fetched only if the raw files lack `proofText`) |
| `license.yearPattern` | `published-before-1931`: regex, group 1 = year, searched in the first 30,000 chars |
| `parser` | see below |
| `parserOptions` | parser configuration (headings etc.) |
| `defaultEnabled` | enabled for new users; all default-on packs together must stay < 50 MB |
| `largePack` | built only with `--include-large`; downloadable on demand in the app |
| `ocr`, `ocrNote` | OCR-derived text; the note (e.g. `OCR text: may contain scanning errors`) is shown with excerpts |
| `bookScope` | `bookScope[i]` = books `rawUrls[i]` covers. Headings naming a book outside the scope are dropped (logged); `[]` = unknown |
| `volumeMapSource` | page from which unknown (`[]`) `bookScope` entries are derived at build time; volumes still unknown are skipped |
| `urlTemplate` | deep link, `{page}` and `{anchor}` (anchor from a heading rule's `anchor` template) |
| `alternateSources` | other editions/files of the work, for reference and link checks only |
| `listedOnly` | listed in the index without excerpts |
| `notes` | maintainer notes |

## Parsers

All text parsers share one structure engine (`scripts/parsers/structure.ts`). It walks the raw
lines, applies `parserOptions.headings` rules and maps sections only by what the work prints.

Heading rule: `{ pattern, flags?, level, label?, book?, chapter?, chapterEnd?, verse?, verseEnd?, refFromLine?, refLookahead?, paragraphStart?, intro?, anchor? }`

- `level`: `unit` (homily/sermon/entry; resets context), `book`, `chapter` (whole-chapter range),
  `verse` (range in the current book/chapter; may also set `book`/`chapter` from groups),
  `label` (sub-heading such as `EXPOSITION`; keeps the range), `skip` (ignore following text).
- `book`: a code (`"PSA"`) or `"$n"` (group parsed as a book name, or a title naming exactly one book).
- `chapter`/`verse`/`verseEnd`: `"$n"` groups; arabic or roman numerals.
- `refFromLine` / `refLookahead: n`: take the range from an explicit citation in the heading line
  or the next n lines (sermon texts, Morning and Evening entry verses).
- `paragraphStart: true`: match the first line of a paragraph and keep the paragraph as content
  (`28. And we know …`, `Verse 1. …`).
- `intro: true` (level `book`): the text before the first chapter heading is the book intro
  (`isBookIntro`, whole-book range, cut at a paragraph boundary, plus the full section).

Common options: `headings`, `layout: "ccel"` (body between the table of contents and the
back-matter indexes), `bodyStart`/`bodyEnd` (line regexes; **must** be found — used to pick one
work out of a multi-author volume), `gutenberg` (auto-detected header/footer stripping),
`locatorFromRange` ("Ps 23:1, Exposition"), `maxChars` (default 1500), `sectionMaxChars`
(full-section excerpts, default 12000), `fullSections` (default true), `minChars` (default 40),
`mappingMethod`.

| parser | for | maps by | specific options |
|---|---|---|---|
| `ccel-txt` | CCEL `cache/{work}.txt` | inline citations confirmed by the work's own *Index of Scripture References* (`scriptureIndex`); without an index, inline citations (`inlineCitation`) | `useIndex: "confirm" \| "ignore"` |
| `verse-commentary` | book → chapter → verse commentaries | heading ranges (`heading`) | `alsoInline` |
| `heading-range` | homilies, sermons, Treasury, Morning and Evening | the unit's heading/text line (`heading`, `sermonText`, `entryVerse`) | `mappingMethod` |
| `inline-citation` | works citing scripture in running text | each citation maps the sentences around it (`inlineCitation`) | `bookIntro: BOOK`, `introLocator` |
| `creed-json-proofs` | Creeds.json | proof texts (`proofText`) or printed citations (`inlineCitation`) | `mode`, `nested`, `textFields`, `locator`, `sectionLabels` |
| `html-chapters` | HTML editions | inline citations, on markup-free text | `discoverLinks` (regex for chapter pages linked from `rawUrls[0]`) |
| `openbible-crossrefs` | OpenBible TSV / zip | data rows, no text | `minVotes`, `maxPerVerse` |

Citations are parsed by `scripts/lib/citations.ts` (capitalized book + chapter required;
two-letter abbreviations need a period and chapter:verse; word-like names such as Job, Mark,
Song need chapter:verse; `ver. 5` only with a heading context; every range validated against
`public/bible/meta.json`). Anything ambiguous or invalid is dropped and logged.

## License bases

- `rights-statement`: the file or its page states the rights, e.g. CCEL header
  `Rights: Public Domain`, Gutenberg page `Public domain in the USA`, Creeds.json
  `"SourceAttribution": "Public Domain"`.
- `published-before-1931`: public domain in the US by publication date. `proofText` identifies the
  edition; the build additionally requires a publication / print-basis year < 1931 in the header.
- `pd-mark`: archive.org item marked with the Public Domain Mark (`publicdomain/mark` on the item page).
- `cc-by`: Creative Commons Attribution; the attribution (author + source page) is shown with the data.

## Excerpt data (what the build writes)

See `src/lib/library.ts` for the types. `charOffset` is a UTF-16 index into
`normalizeWs(sourceText)` of raw file `rawIndex`, where `normalizeWs` only joins line-wrap
hyphenation (`exam-\nple` → `example`) and collapses whitespace runs to one space. JSON sources
(Creeds.json) instead carry `sourcePaths` (e.g. `Data.0.Question`, `Data.0.Answer`) and
`partOffsets`; the text is the normalized field values joined by `\n`. HTML sources carry
`sourceTransform: "html-text"`. Excerpts never contain an added ellipsis: `truncatedStart` /
`truncatedEnd` tell the UI to draw one; `sectionId` points at the full section excerpt
(`fullSection: true`). In a book's shard, an excerpt lists only the `verseRanges` that touch
that book.

## Packs not built in the generating sandbox

The sandbox that produced this repository could reach only GitHub and npm (ccel.org,
gutenberg.org, archive.org and openbible.info answered HTTP 403 at the proxy). Built there:
Heidelberg Catechism, Westminster Confession, Westminster Larger Catechism, Belgic Confession,
Canons of Dort (Creeds.json on GitHub) and OpenBible cross references (GitHub mirror). Every
other pack is listed with its reason in `library/build-report.json` and builds unchanged with
`npm run build:library` on a machine with normal internet. Their heading rules are written from
the editions' known layouts and have not been run against the real files: check
`build-report.json` / `library-build.log` after the first real build and adjust
`parserOptions` where a pack reports no mapped excerpts.
