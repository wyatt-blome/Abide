// Single source of truth for the app's name. Renaming the app is a one-line change here:
// the page title, PWA manifest, headers, .ics and backup filenames all read APP_NAME.
export const APP_NAME = "Abide";

// The verse the name comes from. Its text is never typed here: About reads it from the bundled BSB.
export const APP_NAME_VERSE = { book: "JHN", chapter: 15, verse: 4 } as const;

export const DEFAULT_TRANSLATION = "BSB" as const;
export const BACKUP_SCHEMA_VERSION = 1;
