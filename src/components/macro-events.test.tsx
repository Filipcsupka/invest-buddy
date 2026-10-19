import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MacroEvents } from "./macro-events";

describe("MacroEvents", () => {
  it("lists the next events with a local label and the informational note", () => {
    const html = renderToStaticMarkup(<MacroEvents locale="en" today="2026-10-23" />);
    expect(html).toContain("Fed rate decision");
    expect(html).toContain("in 3 trading days");
    expect(html).toContain("scores and signals do not change");
  });
  it("uses Slovak text", () => {
    const html = renderToStaticMarkup(<MacroEvents locale="sk" today="2026-10-28" />);
    expect(html).toContain("Rozhodnutie Fedu o sadzbách");
    expect(html).toContain("dnes");
  });
  it("lists the stored schedule when it is passed", () => {
    const html = renderToStaticMarkup(<MacroEvents locale="en" today="2027-01-11" schedule={[{ date: "2027-01-13", kind: "CPI", label: "CPI (December)" }]} />);
    expect(html).toContain('dateTime="2027-01-13"');
    expect(html).toContain("in 2 trading days");
  });
  it("renders nothing when no event is near", () => {
    expect(renderToStaticMarkup(<MacroEvents locale="en" today="2027-03-01" />)).toBe("");
  });
});
