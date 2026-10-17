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
