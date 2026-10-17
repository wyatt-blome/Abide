// Bundled classics: IDs, titles, authors, edition labels and URLs ONLY. No text lives here; the
// app downloads a work on demand (src/lib/classics.ts) and keeps it in Cache Storage.

export type ClassicFormat = "gutenberg" | "archive-djvu-txt" | "ccel-txt";

export interface ClassicInfo {
  id: string;
  title: string;
  author: string;
  /** Edition / source label shown with the text (provenance). */
  edition: string;
  /** Human-readable page for the edition. */
  sourcePage: string;
  /** Plain-text files, in reading order (City of God has two volumes). */
  textUrls: string[];
  format: ClassicFormat;
  /** Date-locked devotional: only today's entries are shown. */
  dateLocked?: boolean;
  /** Text produced by OCR (may contain scanning errors). */
  ocr?: boolean;
}

const gutenbergText = (n: number): string => `https://www.gutenberg.org/cache/epub/${n}/pg${n}.txt`;
const gutenbergPage = (n: number): string => `https://www.gutenberg.org/ebooks/${n}`;

export const CLASSICS: ClassicInfo[] = [
  {
    id: "confessions",
    title: "The Confessions of Saint Augustine",
    author: "Augustine of Hippo",
    edition: "Project Gutenberg eBook #3296",
    sourcePage: gutenbergPage(3296),
    textUrls: [gutenbergText(3296)],
    format: "gutenberg",
  },
  {
    id: "city-of-god",
    title: "The City of God",
    author: "Augustine of Hippo",
    edition: "Project Gutenberg eBooks #45304 and #45305 (Volumes I and II)",
    sourcePage: gutenbergPage(45304),
    textUrls: [gutenbergText(45304), gutenbergText(45305)],
    format: "gutenberg",
  },
  {
    id: "pilgrims-progress",
    title: "The Pilgrim's Progress",
    author: "John Bunyan",
    edition: "Project Gutenberg eBook #131",
    sourcePage: gutenbergPage(131),
    textUrls: [gutenbergText(131)],
    format: "gutenberg",
  },
  {
    id: "imitation-of-christ",
    title: "The Imitation of Christ",
    author: "Thomas à Kempis",
    edition: "Project Gutenberg eBook #1653",
    sourcePage: gutenbergPage(1653),
    textUrls: [gutenbergText(1653)],
    format: "gutenberg",
  },
  {
    id: "pensees",
    title: "Pensées",
    author: "Blaise Pascal",
    edition: "Project Gutenberg eBook #18269",
    sourcePage: gutenbergPage(18269),
    textUrls: [gutenbergText(18269)],
    format: "gutenberg",
  },
  {
    id: "grace-abounding",
    title: "Grace Abounding to the Chief of Sinners",
    author: "John Bunyan",
    edition: "Project Gutenberg eBook #654",
    sourcePage: gutenbergPage(654),
    textUrls: [gutenbergText(654)],
    format: "gutenberg",
  },
  {
    id: "abide-in-christ",
    title: "Abide in Christ",
    author: "Andrew Murray",
    edition: "Internet Archive item abideinchrist01murr (OCR text)",
    sourcePage: "https://archive.org/details/abideinchrist01murr",
    textUrls: ["https://archive.org/download/abideinchrist01murr/abideinchrist01murr_djvu.txt"],
    format: "archive-djvu-txt",
    ocr: true,
  },
  {
    id: "morning-and-evening",
    title: "Morning and Evening",
    author: "C. H. Spurgeon",
    edition: "Christian Classics Ethereal Library (ccel.org/ccel/s/spurgeon/morneve)",
    sourcePage: "https://ccel.org/ccel/spurgeon/morneve",
    textUrls: ["https://ccel.org/ccel/s/spurgeon/morneve/cache/morneve.txt"],
    format: "ccel-txt",
    dateLocked: true,
  },
];

export const CLASSIC_BY_ID: Record<string, ClassicInfo> = Object.fromEntries(CLASSICS.map((c) => [c.id, c]));
