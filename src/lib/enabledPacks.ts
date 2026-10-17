// Which library packs are on.
//
// settings.enabledPacks = [] means "the defaults" (packs flagged defaultEnabled), as the offline
// warm-up also reads it. Turning every pack off therefore stores the sentinel NO_PACKS, an id no
// pack can have, so the list is non-empty and matches nothing.

import { defaultEnabledPackIds } from "@/lib/library";

export const NO_PACKS = "(none)";

/** Effective pack ids given the stored list and the default ids. */
export function effectivePackIds(stored: readonly string[], defaults: readonly string[]): string[] {
  if (!stored.length) return [...defaults];
  return stored.filter((id) => id !== NO_PACKS);
}

/** The list to store after switching one pack on or off. */
export function togglePack(stored: readonly string[], defaults: readonly string[], id: string, on: boolean): string[] {
  const cur = effectivePackIds(stored, defaults);
  const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
  return next.length ? next.sort() : [NO_PACKS];
}

/** Effective pack ids, loading the defaults from the library index when the stored list is empty. */
export async function resolveEnabledPackIds(stored: readonly string[]): Promise<string[]> {
  if (stored.length) return effectivePackIds(stored, []);
  return defaultEnabledPackIds();
}
