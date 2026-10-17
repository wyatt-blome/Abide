// Point the client Bible loader at the generated files on disk.
import { readFileSync } from "node:fs";
import path from "node:path";
import { configureBible } from "@/lib/bible";

const root = path.resolve(__dirname, "../..");

export function useDiskBible(): void {
  configureBible({
    basePath: "/bible",
    fetchJson: async (p: string) => JSON.parse(readFileSync(path.join(root, "public", p), "utf8")),
  });
}
