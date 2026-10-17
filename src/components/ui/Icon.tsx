import type { ReactNode } from "react";

export type IconName =
  | "check"
  | "cross"
  | "play"
  | "pause"
  | "stop"
  | "speaker"
  | "mic"
  | "micOff"
  | "book"
  | "today"
  | "cards"
  | "library"
  | "settings"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "chevronUp"
  | "plus"
  | "minus"
  | "close"
  | "skipNext"
  | "skipPrev"
  | "repeat"
  | "eye"
  | "eyeOff"
  | "calendar"
  | "flame"
  | "search"
  | "info"
  | "external"
  | "download"
  | "upload"
  | "trash"
  | "edit"
  | "car"
  | "list"
  | "chart"
  | "keyboard"
  | "lightbulb"
  | "sun"
  | "moon"
  | "refresh";

const P = (d: string) => <path d={d} />;

const PATHS: Record<IconName, ReactNode> = {
  check: P("M4.5 12.5l5 5L19.5 7"),
  cross: P("M6 6l12 12M18 6L6 18"),
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  speaker: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      {P("M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11")}
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      {P("M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7")}
    </>
  ),
  micOff: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      {P("M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7M4 4l16 16")}
    </>
  ),
  book: P("M3.5 5.5c2.8-1 5.6-1 8.5 1v13c-2.9-2-5.7-2-8.5-1zM20.5 5.5c-2.8-1-5.6-1-8.5 1v13c2.9-2 5.7-2 8.5-1z"),
  today: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      {P("M4 10h16M8.5 3v4M15.5 3v4")}
      <rect x="8" y="13" width="3.5" height="3.5" fill="currentColor" stroke="none" />
    </>
  ),
  cards: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      {P("M9 9h6M9 12.5h6M9 16h3.5")}
    </>
  ),
  library: P("M4.5 4h3.5v16H4.5zM10.5 4H14v16h-3.5zM16.3 5.2l3.3-.9 3.4 15-3.3.9z"),
  settings: (
    <>
      {P("M4 7h9M17 7h3M4 17h3M11 17h9M4 12h13M21 12h-0.5")}
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  chevronLeft: P("M15 5l-7 7 7 7"),
  chevronRight: P("M9 5l7 7-7 7"),
  chevronDown: P("M5 9l7 7 7-7"),
  chevronUp: P("M5 15l7-7 7 7"),
  plus: P("M12 5v14M5 12h14"),
  minus: P("M5 12h14"),
  close: P("M6 6l12 12M18 6L6 18"),
  skipNext: (
    <>
      <path d="M5 5.5v13l9-6.5z" fill="currentColor" />
      {P("M18 5.5v13")}
    </>
  ),
  skipPrev: (
    <>
      <path d="M19 5.5v13l-9-6.5z" fill="currentColor" />
      {P("M6 5.5v13")}
    </>
  ),
  repeat: P("M4 11V9a3 3 0 013-3h12M16 3l3 3-3 3M20 13v2a3 3 0 01-3 3H5M8 21l-3-3 3-3"),
  eye: (
    <>
      {P("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z")}
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: P("M3 3l18 18M10.6 6.1A9 9 0 0112 6c6 0 9.5 6 9.5 6a16 16 0 01-3 3.6M6.2 7.6A16 16 0 002.5 12S6 18 12 18a8.6 8.6 0 004.3-1.1M9.9 10a3 3 0 004.2 4.2"),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      {P("M4 10h16M8.5 3v4M15.5 3v4")}
    </>
  ),
  flame: P("M12 3c.5 3.5 5 5.5 5 10.5a5 5 0 01-10 0c0-2.5 1.5-3.5 2-5.5 1 1.5 1.5 2.5 3 3 0-3-1-5.5 0-8z"),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      {P("M15 15l5.5 5.5")}
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P("M12 11v6M12 7.5v.5")}
    </>
  ),
  external: P("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"),
  download: P("M12 4v11M7 10.5l5 5 5-5M5 20h14"),
  upload: P("M12 15V4M7 8.5l5-5 5 5M5 20h14"),
  trash: P("M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"),
  edit: P("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"),
  car: (
    <>
      {P("M3.5 16.5v-4l2-5.5h13l2 5.5v4zM3.5 12.5h17")}
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
    </>
  ),
  list: P("M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5"),
  chart: P("M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      {P("M6 10h.5M9.5 10h.5M13.5 10h.5M17.5 10h.5M7.5 14h9")}
    </>
  ),
  lightbulb: P("M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      {P("M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4")}
    </>
  ),
  moon: P("M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"),
  refresh: P("M20 11a8 8 0 10-2.3 5.7M20 4.5V11h-6.5"),
};

export interface IconProps {
  name: IconName;
  /** Pixel size (square). Default 24. */
  size?: number;
  /** Screen-reader text. Omit when the surrounding control already has a label. */
  label?: string;
  className?: string;
  strokeWidth?: number;
}

/** Inline SVG icon. The SVG is always aria-hidden; `label` renders as sr-only text. */
export function Icon({ name, size = 24, label, className, strokeWidth = 2.25 }: IconProps) {
  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        data-icon={name}
      >
        {PATHS[name]}
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
