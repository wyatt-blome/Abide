// navigator.vibrate wrapper. Silently does nothing where unsupported (e.g. iOS Safari).
export type HapticPattern = "tap" | "success" | "error" | "warning" | "heavy" | number | number[];

const PATTERNS: Record<Exclude<HapticPattern, number | number[]>, number | number[]> = {
  tap: 10,
  success: [20, 40, 20],
  error: [60, 50, 60],
  warning: [30, 60, 30],
  heavy: 40,
};

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function haptic(pattern: HapticPattern = "tap"): void {
  if (!canVibrate()) return;
  const p = typeof pattern === "string" ? PATTERNS[pattern] : pattern;
  try {
    navigator.vibrate(p);
  } catch {
    // ignore: some browsers throw when not triggered by a user gesture
  }
}
