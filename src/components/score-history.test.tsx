import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScoreHistory } from "./score-history";

const rows = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 2 + (n - 1 - i)));
  return { asOf: d.toISOString().slice(0, 10), technical: 5, fundamentals: 6, macro: 2, total: 13 + (i % 3), state: "Watch" };
});

describe("score history", () => {
  it("shows the empty text for no rows", () => {
    const html = renderToStaticMarkup(<ScoreHistory ticker="NVDA" rows={[]} locale="en" />);
    expect(html).toContain("Not enough history yet");
    expect(html).not.toContain("<svg");
  });
  it("shows a table but no chart for one point", () => {
    const html = renderToStaticMarkup(<ScoreHistory ticker="NVDA" rows={rows(1)} locale="en" />);
    expect(html).toContain("Not enough history yet");
    expect(html).toContain("<table");
    expect(html).not.toContain("<svg");
  });
  for (const n of [2, 60]) it(`draws chart and table for ${n} points`, () => {
    const html = renderToStaticMarkup(<ScoreHistory ticker="NVDA" rows={rows(n)} locale="en" />);
    expect(html).toContain("<svg");
    expect(html).toContain(`over ${n} scan days`);
    expect(html.match(/<tr>/g)?.length).toBe(n + 1);
    expect(html).not.toContain("Not enough history yet");
  });
  it("renders Slovak strings", () => {
    const html = renderToStaticMarkup(<ScoreHistory ticker="NVDA" rows={rows(3)} locale="sk" />);
    expect(html).toContain("Zobraziť ako tabuľku");
    expect(html).toContain("dní skenu");
    expect(html).toContain("<td>Sledovanie");
  });
});
