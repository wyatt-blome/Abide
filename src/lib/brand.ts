// Brand colors shared by the web manifest, viewport theme-color and scripts/make-icons.ts.
export const BRAND_COLOR = "#2d5a3d";
export const BRAND_ON_COLOR = "#ffffff";
export const BRAND_BACKGROUND = "#ffffff";

/** <meta name="theme-color"> per resolved theme (matches --bg in globals.css). */
export const THEME_META_COLORS = {
  light: "#ffffff",
  dark: "#121212",
  sunlight: "#ffffff",
  handsFree: "#000000",
} as const;
