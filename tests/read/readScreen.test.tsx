// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "@/components/providers/AppProviders";
import { ReadScreen } from "@/components/reader/ReadScreen";
import { db } from "@/db/db";
import { clearAllData } from "@/db/repo";
import { configureBible } from "@/lib/bible";
import { addDays, todayISO } from "@/lib/isoDate";
import { dayId, getPlanDays, setDayDone } from "@/lib/readingPlanStore";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/read",
  useSearchParams: () => new URLSearchParams(),
}));

const root = path.resolve(__dirname, "../..");

beforeAll(() => {
  configureBible({ fetchJson: async (p) => JSON.parse(readFileSync(path.join(root, "public", p), "utf8")) });
});
beforeEach(async () => {
  await clearAllData();
  sessionStorage.clear();
});
afterEach(cleanup);

const ui = () =>
  render(
    <AppProviders>
      <ReadScreen />
    </AppProviders>,
  );

describe("Read tab", () => {
  it("setup wizard creates a 312-day plan starting next Monday", async () => {
    ui();
    const start = await screen.findByRole("button", { name: /start plan/i });
    expect(screen.getByRole("radio", { name: /blended/i }).getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => expect(await db.readingPlans.count()).toBe(1), { timeout: 10000 });
    const plan = (await db.readingPlans.toArray())[0];
    expect(plan.style).toBe("blended");
    expect(plan.graceWeekday).toBe(0);
    expect(new Date(`${plan.startDate}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(await db.readingDays.where("planId").equals(plan.id).count()).toBe(312);
    expect(await screen.findByText(/your plan starts/i, undefined, { timeout: 10000 })).toBeTruthy();
  });

  it("asks once about missed days and remembers the choice", async () => {
    ui();
    const start = await screen.findByRole("button", { name: /start plan/i });
    // Start two weeks ago so there are missed days.
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: addDays(todayISO(), -14) } });
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => expect(await db.readingPlans.count()).toBe(1), { timeout: 10000 });
    const plan = (await db.readingPlans.toArray())[0];
    await setDayDone(dayId(plan.id, 0), true);

    const choice = await screen.findByRole("button", { name: /spread over next 2 weeks/i }, { timeout: 10000 });
    await act(async () => {
      fireEvent.click(choice);
    });
    await waitFor(async () => expect((await db.readingPlans.get(plan.id))?.missedPolicy).toBe("spread"), { timeout: 10000 });
    const days = await getPlanDays(plan.id);
    const today = todayISO();
    expect(days.filter((d) => d.date < today && d.portions.some((p) => !p.done))).toHaveLength(0);
    expect(days[0].portions.every((p) => p.done)).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
