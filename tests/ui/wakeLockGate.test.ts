import { describe, expect, it, vi } from "vitest";
import { createWakeLockGate, type WakeLockHandle } from "@/lib/media";

function fakeRequests() {
  const handles: { handle: WakeLockHandle; release: ReturnType<typeof vi.fn> }[] = [];
  const resolvers: ((h: WakeLockHandle) => void)[] = [];
  const request = vi.fn(
    () =>
      new Promise<WakeLockHandle>((resolve) => {
        const release = vi.fn(async () => {});
        const handle = { active: true, release };
        handles.push({ handle, release });
        resolvers.push(() => resolve(handle));
      }),
  );
  return { request, handles, resolveAll: () => resolvers.splice(0).forEach((r) => r(undefined as never)) };
}

describe("createWakeLockGate", () => {
  it("overlapping acquire() calls share one request and hold one lock", async () => {
    const f = fakeRequests();
    const gate = createWakeLockGate(f.request);
    const a = gate.acquire();
    const b = gate.acquire();
    f.resolveAll();
    await Promise.all([a, b]);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(gate.held).toBe(f.handles[0].handle);
    await gate.acquire();
    expect(f.request).toHaveBeenCalledTimes(1);
    gate.release();
    expect(f.handles[0].release).toHaveBeenCalledTimes(1);
    expect(gate.held).toBeNull();
  });

  it("a lock that arrives after release() is released at once", async () => {
    const f = fakeRequests();
    const gate = createWakeLockGate(f.request);
    const a = gate.acquire();
    gate.release();
    f.resolveAll();
    await a;
    expect(gate.held).toBeNull();
    expect(f.handles[0].release).toHaveBeenCalledTimes(1);
  });
});
