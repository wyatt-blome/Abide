import { createHash } from "node:crypto";

/** sha256 hex of a string (UTF-8) or bytes. */
export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** First 8 hex chars of sha256, used for stable excerpt ids `{packId}:{hash8}`. */
export function hash8(data: string): string {
  return sha256(data).slice(0, 8);
}
