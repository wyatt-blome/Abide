// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/db";
import { AddLinkSheet, siteFromUrl } from "@/components/library/AddLinkSheet";
import { useDiskData } from "./_setup";

beforeAll(async () => {
  useDiskData();
  await db.linkOuts.clear();
});
afterEach(cleanup);

const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const confirm = () => screen.getByRole("checkbox", { name: /Confirm tags/ }) as HTMLInputElement;

describe("AddLinkSheet", () => {
  it("derives the site from the URL hostname", () => {
    expect(siteFromUrl("https://www.example.org/a/b")).toBe("example.org");
    expect(siteFromUrl("ftp://example.org")).toBe("");
    expect(siteFromUrl("not a url")).toBe("");
  });

  it("enables Save only with a stated reference and a confirmed verse tag", async () => {
    render(<AddLinkSheet open onClose={() => {}} />);
    await waitFor(() => expect((screen.getByRole("button", { name: /Pick from the book list/ }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Web address"), { target: { value: "https://www.example.org/lorem" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lorem ipsum" } });
    expect(save().disabled).toBe(true);

    // Tag without a stated reference: still disabled.
    fireEvent.change(screen.getByLabelText("Type a reference"), { target: { value: "Rom 8:28" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Romans 8:28");
    fireEvent.click(confirm());
    expect(confirm().checked).toBe(true);
    expect(save().disabled).toBe(true);

    // Stated reference + confirmed tag: enabled.
    fireEvent.change(screen.getByLabelText(/Stated reference/), { target: { value: "Romans 8:28" } });
    expect(save().disabled).toBe(false);

    // Changing the tags clears the confirmation: disabled again until re-confirmed.
    fireEvent.click(screen.getByRole("button", { name: "Remove Romans 8:28" }));
    expect(confirm().checked).toBe(false);
    expect(confirm().disabled).toBe(true);
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type a reference"), { target: { value: "Rom 8:28" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Romans 8:28");
    expect(save().disabled).toBe(true);
    fireEvent.click(confirm());
    expect(save().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(save());
    });
    await waitFor(async () => expect(await db.linkOuts.count()).toBe(1));
    const [link] = await db.linkOuts.toArray();
    expect(link).toMatchObject({ url: "https://www.example.org/lorem", site: "example.org", statedReference: "Romans 8:28" });
    expect(link.verseKeys).toEqual(["ROM.8.28"]);
  });

  it("prefills tags from the stated reference but still needs confirmation", async () => {
    render(<AddLinkSheet open onClose={() => {}} initialUrl="https://example.org/x" initialTitle="Lorem" />);
    await waitFor(() => expect((screen.getByRole("button", { name: /Pick from the book list/ }) as HTMLButtonElement).disabled).toBe(false));
    const stated = screen.getByLabelText(/Stated reference/);
    fireEvent.change(stated, { target: { value: "Rom 8:28-30" } });
    fireEvent.blur(stated);
    await screen.findByText("Romans 8:28–30");
    expect(save().disabled).toBe(true);
    fireEvent.click(confirm());
    expect(save().disabled).toBe(false);
  });
});
