// Canonical 66-book table. USFM codes are the app's BookCode; OSIS ids match OpenBible.info data.
// `aliases` are lowercase forms (no trailing period) used when parsing citations in old works;
// matching is done by scripts and lib/refs.ts, never by guessing what a paragraph is about.

export interface BookInfo { code: string; osis: string; name: string; testament: "OT" | "NT"; aliases: string[] }

const B = (code: string, osis: string, name: string, testament: "OT" | "NT", aliases: string[]): BookInfo =>
  ({ code, osis, name, testament, aliases });

export const BOOKS: BookInfo[] = [
  B("GEN", "Gen", "Genesis", "OT", ["gen", "ge", "gn", "genesis"]),
  B("EXO", "Exod", "Exodus", "OT", ["exod", "exo", "ex", "exodus"]),
  B("LEV", "Lev", "Leviticus", "OT", ["lev", "le", "lv", "leviticus"]),
  B("NUM", "Num", "Numbers", "OT", ["num", "nu", "nm", "numb", "numbers"]),
  B("DEU", "Deut", "Deuteronomy", "OT", ["deut", "deu", "dt", "de", "deuteronomy"]),
  B("JOS", "Josh", "Joshua", "OT", ["josh", "jos", "jsh", "joshua"]),
  B("JDG", "Judg", "Judges", "OT", ["judg", "jdg", "jg", "jud", "judges"]),
  B("RUT", "Ruth", "Ruth", "OT", ["ruth", "rut", "ru"]),
  B("1SA", "1Sam", "1 Samuel", "OT", ["1 sam", "1sam", "1 sa", "1sa", "i sam", "1 samuel", "i samuel", "1 kingdoms"]),
  B("2SA", "2Sam", "2 Samuel", "OT", ["2 sam", "2sam", "2 sa", "2sa", "ii sam", "2 samuel", "ii samuel"]),
  B("1KI", "1Kgs", "1 Kings", "OT", ["1 kings", "1 kgs", "1kgs", "1 ki", "1ki", "i kings", "i kgs", "1 kin"]),
  B("2KI", "2Kgs", "2 Kings", "OT", ["2 kings", "2 kgs", "2kgs", "2 ki", "2ki", "ii kings", "ii kgs", "2 kin"]),
  B("1CH", "1Chr", "1 Chronicles", "OT", ["1 chron", "1 chr", "1chr", "1 ch", "1ch", "i chron", "i chr", "1 chronicles", "i chronicles"]),
  B("2CH", "2Chr", "2 Chronicles", "OT", ["2 chron", "2 chr", "2chr", "2 ch", "2ch", "ii chron", "ii chr", "2 chronicles", "ii chronicles"]),
  B("EZR", "Ezra", "Ezra", "OT", ["ezra", "ezr"]),
  B("NEH", "Neh", "Nehemiah", "OT", ["neh", "ne", "nehemiah"]),
  B("EST", "Esth", "Esther", "OT", ["esth", "est", "es", "esther"]),
  B("JOB", "Job", "Job", "OT", ["job", "jb"]),
  B("PSA", "Ps", "Psalms", "OT", ["ps", "psa", "psalm", "psalms", "pss", "psal"]),
  B("PRO", "Prov", "Proverbs", "OT", ["prov", "pro", "prv", "pr", "proverbs"]),
  B("ECC", "Eccl", "Ecclesiastes", "OT", ["eccl", "ecc", "eccles", "ec", "ecclesiastes", "qoh"]),
  B("SNG", "Song", "Song of Solomon", "OT", ["song", "sng", "song of solomon", "song of songs", "cant", "canticles", "song of sol", "sol"]),
  B("ISA", "Isa", "Isaiah", "OT", ["isa", "is", "isaiah", "esai"]),
  B("JER", "Jer", "Jeremiah", "OT", ["jer", "je", "jeremiah"]),
  B("LAM", "Lam", "Lamentations", "OT", ["lam", "la", "lamentations"]),
  B("EZK", "Ezek", "Ezekiel", "OT", ["ezek", "eze", "ezk", "ezekiel"]),
  B("DAN", "Dan", "Daniel", "OT", ["dan", "da", "dn", "daniel"]),
  B("HOS", "Hos", "Hosea", "OT", ["hos", "ho", "hosea"]),
  B("JOL", "Joel", "Joel", "OT", ["joel", "jol", "jl"]),
  B("AMO", "Amos", "Amos", "OT", ["amos", "amo", "am"]),
  B("OBA", "Obad", "Obadiah", "OT", ["obad", "oba", "ob", "obadiah"]),
  B("JON", "Jonah", "Jonah", "OT", ["jonah", "jon", "jnh"]),
  B("MIC", "Mic", "Micah", "OT", ["mic", "mi", "micah"]),
  B("NAM", "Nah", "Nahum", "OT", ["nah", "nam", "na", "nahum"]),
  B("HAB", "Hab", "Habakkuk", "OT", ["hab", "hb", "habakkuk"]),
  B("ZEP", "Zeph", "Zephaniah", "OT", ["zeph", "zep", "zp", "zephaniah"]),
  B("HAG", "Hag", "Haggai", "OT", ["hag", "hg", "haggai"]),
  B("ZEC", "Zech", "Zechariah", "OT", ["zech", "zec", "zc", "zechariah"]),
  B("MAL", "Mal", "Malachi", "OT", ["mal", "ml", "malachi"]),
  B("MAT", "Matt", "Matthew", "NT", ["matt", "mat", "mt", "matthew"]),
  B("MRK", "Mark", "Mark", "NT", ["mark", "mrk", "mk", "mar"]),
  B("LUK", "Luke", "Luke", "NT", ["luke", "luk", "lk", "lu"]),
  B("JHN", "John", "John", "NT", ["john", "jhn", "jn", "joh"]),
  B("ACT", "Acts", "Acts", "NT", ["acts", "act", "ac"]),
  B("ROM", "Rom", "Romans", "NT", ["rom", "ro", "rm", "romans"]),
  B("1CO", "1Cor", "1 Corinthians", "NT", ["1 cor", "1cor", "1 co", "1co", "i cor", "1 corinthians", "i corinthians"]),
  B("2CO", "2Cor", "2 Corinthians", "NT", ["2 cor", "2cor", "2 co", "2co", "ii cor", "2 corinthians", "ii corinthians"]),
  B("GAL", "Gal", "Galatians", "NT", ["gal", "ga", "galatians"]),
  B("EPH", "Eph", "Ephesians", "NT", ["eph", "ephes", "ephesians"]),
  B("PHP", "Phil", "Philippians", "NT", ["phil", "php", "philippians"]),
  B("COL", "Col", "Colossians", "NT", ["col", "colossians"]),
  B("1TH", "1Thess", "1 Thessalonians", "NT", ["1 thess", "1thess", "1 th", "1th", "i thess", "1 thessalonians", "i thessalonians"]),
  B("2TH", "2Thess", "2 Thessalonians", "NT", ["2 thess", "2thess", "2 th", "2th", "ii thess", "2 thessalonians", "ii thessalonians"]),
  B("1TI", "1Tim", "1 Timothy", "NT", ["1 tim", "1tim", "1 ti", "1ti", "i tim", "1 timothy", "i timothy"]),
  B("2TI", "2Tim", "2 Timothy", "NT", ["2 tim", "2tim", "2 ti", "2ti", "ii tim", "2 timothy", "ii timothy"]),
  B("TIT", "Titus", "Titus", "NT", ["titus", "tit"]),
  B("PHM", "Phlm", "Philemon", "NT", ["phlm", "phm", "philem", "philemon"]),
  B("HEB", "Heb", "Hebrews", "NT", ["heb", "hebrews"]),
  B("JAS", "Jas", "James", "NT", ["jas", "jam", "james", "jms"]),
  B("1PE", "1Pet", "1 Peter", "NT", ["1 pet", "1pet", "1 pe", "1pe", "i pet", "1 peter", "i peter"]),
  B("2PE", "2Pet", "2 Peter", "NT", ["2 pet", "2pet", "2 pe", "2pe", "ii pet", "2 peter", "ii peter"]),
  B("1JN", "1John", "1 John", "NT", ["1 john", "1john", "1 jn", "1jn", "1 joh", "i john", "i joh"]),
  B("2JN", "2John", "2 John", "NT", ["2 john", "2john", "2 jn", "2jn", "2 joh", "ii john", "ii joh"]),
  B("3JN", "3John", "3 John", "NT", ["3 john", "3john", "3 jn", "3jn", "3 joh", "iii john", "iii joh"]),
  B("JUD", "Jude", "Jude", "NT", ["jude", "jud"]),
  B("REV", "Rev", "Revelation", "NT", ["rev", "re", "revelation", "apoc", "apocalypse"]),
];

export const BOOK_CODES = BOOKS.map((b) => b.code);
export const BOOK_BY_CODE: Record<string, BookInfo> = Object.fromEntries(BOOKS.map((b) => [b.code, b]));
export const BOOK_BY_OSIS: Record<string, BookInfo> = Object.fromEntries(BOOKS.map((b) => [b.osis, b]));
export const bookIndex = (code: string): number => BOOK_CODES.indexOf(code);

/** Psalms and Proverbs form the "PP" track of the blended reading plan. */
export const PP_BOOKS = ["PSA", "PRO"];
