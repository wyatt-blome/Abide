// localStorage keys mirrored by AppProviders and read by the pre-paint script in layout.tsx.
// Kept out of the "use client" module so the server layout can read the actual strings.
export const THEME_STORAGE_KEY = "abide:theme";
export const FONT_SCALE_STORAGE_KEY = "abide:fontScale";
