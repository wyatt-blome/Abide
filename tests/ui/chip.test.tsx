// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Chip, ChipGroup } from "@/components/ui/Chip";

afterEach(cleanup);

describe("Chip", () => {
  it("reflects pressed state with aria-pressed", () => {
    function One() {
      const [on, setOn] = useState(false);
      return (
        <Chip pressed={on} onPressedChange={setOn}>
          Sermons
        </Chip>
      );
    }
    render(<One />);
    const chip = screen.getByRole("button", { name: "Sermons" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.className).toMatch(/min-h-12/);
  });

  it("ChipGroup toggles options (multi and single)", () => {
    function Multi({ single }: { single?: boolean }) {
      const [sel, setSel] = useState<("a" | "b")[]>(["a"]);
      return (
        <ChipGroup
          label="Types"
          single={single}
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ]}
          selected={sel}
          onChange={setSel}
        />
      );
    }
    render(<Multi />);
    expect(screen.getByRole("group", { name: "Types" })).toBeTruthy();
    const a = screen.getByRole("button", { name: "Alpha" });
    const b = screen.getByRole("button", { name: "Beta" });
    expect(a.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(b);
    expect(a.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("aria-pressed")).toBe("true");
    cleanup();

    render(<Multi single />);
    const a2 = screen.getByRole("button", { name: "Alpha" });
    const b2 = screen.getByRole("button", { name: "Beta" });
    fireEvent.click(b2);
    expect(a2.getAttribute("aria-pressed")).toBe("false");
    expect(b2.getAttribute("aria-pressed")).toBe("true");
  });
});
