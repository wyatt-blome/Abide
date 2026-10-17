// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

afterEach(cleanup);

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        title="Pick one"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        footer={<button type="button">Done</button>}
      >
        <button type="button">First</button>
        <button type="button">Second</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("is a labelled modal dialog and focuses inside on open", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog", { name: "Pick one" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("traps Tab focus inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    const done = screen.getByText("Done");
    act(() => done.focus());
    fireEvent.keyDown(document, { key: "Tab" });
    // Wrapped from the last focusable (Done) to the first (Close button in the header).
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(done);
  });

  it("closes on Escape and restores focus to the opener", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByText("Open");
    act(() => opener.focus());
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on backdrop tap", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
