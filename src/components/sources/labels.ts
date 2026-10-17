// Every fixed UI label the Sources panel may render. The panel shows nothing else except
// verbatim excerpt text, BSB headings and verse text, citation field values, and the user's own
// notes/links. tests/library-ui checks every visible text node against this list.

import { ERA_LABELS, MAPPING_LABELS, TYPE_LABELS } from "@/lib/library";

export const SL = {
  outline: "Outline",
  headingSource: "Heading: Berean Standard Bible",
  versesOnly: "Verses",
  storyDrill: "Story of the Passage drill",
  bookIntro: "Book introduction",
  noBookIntro: "No sourced book introduction available.",
  readFullIntro: "Read full intro",
  readFullSection: "Read full section",
  fullSectionTitle: "Full section",
  noFullSection: "The full section could not be loaded.",
  othersWrote: "What others wrote",
  noExcerpts: "No sourced material indexed for this passage yet",
  noExcerptsForType: "No sourced material of the chosen types for this passage",
  filterByType: "Filter by type",
  modernPointer: "See From my reading and Links below",
  mappedTo: "Mapped to",
  source: "Source ↗",
  opensNewTab: "(opens in a new tab)",
  question: "Q.",
  answer: "A.",
  ellipsis: "…",
  shortenedStart: "(excerpt starts mid-paragraph)",
  shortenedEnd: "(excerpt continues in the source)",
  ocrDefault: "OCR text: may contain scanning errors",
  separator: "·",
  crossRefs: "Cross-references",
  crossRefsAttribution: "Cross-references: OpenBible.info, CC BY — based mainly on the Treasury of Scripture Knowledge",
  crossRefsLink: "OpenBible.info cross-references ↗",
  crossRefsFrom: "From",
  noCrossRefs: "No cross-references indexed for this passage yet",
  crossRefsOff: "Cross-references are turned off in the Library manager",
  showMore: "Show more",
  fromMyReading: "From my reading",
  fromMyReadingTag: "from my reading",
  enteredByMe: "entered by me",
  quote: "Quote",
  note: "Note",
  noNotes: "No notes from my reading tagged to this passage yet",
  links: "Links",
  bibleProjectVideo: "BibleProject video",
  bibleProjectExplore: "BibleProject",
  myLinks: "My saved links",
  statedReference: "Stated reference",
  referenceEnteredByMe: "reference entered by me",
  noLinks: "No saved links tagged to this passage yet",
  loading: "Loading…",
  loadFailed: "This section could not be loaded.",
  sourcesTitle: "Sources",
} as const;

export const TYPE_FILTER_ALL = "All";

/** "v. 5", "vv. 1–17" (single-chapter outline segments). */
export function versesLabel(from: number, to: number): string {
  return from === to ? `v. ${from}` : `vv. ${from}–${to}`;
}

/** "p. 212" (the page a user typed for a note). */
export function pageLabel(page: string): string {
  return `p. ${page}`;
}

export const SOURCES_UI_LABELS: readonly string[] = [
  ...Object.values(SL),
  TYPE_FILTER_ALL,
  ...Object.values(ERA_LABELS),
  ...Object.values(TYPE_LABELS),
  ...Object.values(MAPPING_LABELS),
];

/** Patterns of generated UI labels (verse-span and page labels). */
export const SOURCES_UI_LABEL_PATTERNS: readonly RegExp[] = [/^vv?\. \d+(–\d+)?$/, /^p\. .+$/];
