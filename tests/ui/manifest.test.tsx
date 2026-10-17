import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { APP_NAME } from "@/config";

describe("web manifest", () => {
  it("reads APP_NAME and is installable", () => {
    const m = manifest();
    expect(m.name).toBe(APP_NAME);
    expect(m.short_name).toBe(APP_NAME);
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(sizes).toContain("192x192:any");
    expect(sizes).toContain("512x512:any");
    expect(sizes).toContain("512x512:maskable");
  });
});
