// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";

afterEach(cleanup);

function Harness() {
  const [on, setOn] = useState(false);
  return <Toggle checked={on} onChange={setOn} label="Show verse numbers" description="Plain helper" />;
}

describe("Toggle", () => {
  it("is a switch named by its label with aria-checked", () => {
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Show verse numbers" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("is at least 48px tall", () => {
    render(<Harness />);
    expect(screen.getByRole("switch").className).toMatch(/\bh-12\b/);
  });

  it("links the description", () => {
    render(<Harness />);
    const sw = screen.getByRole("switch");
    const id = sw.getAttribute("aria-describedby");
    expect(id && document.getElementById(id)?.textContent).toBe("Plain helper");
  });
});
