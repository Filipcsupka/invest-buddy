import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeatmapBento } from "./heatmap-bento";
import { aggregateSectors, summarizeHeatmap, type HeatInput } from "@/heatmap/aggregate";

const row = (ticker: string, sector: string, change: number | null): HeatInput => ({
  instrument: { ticker, name: ticker, sector },
  result: { state: "Watch", ruleHits: [], inputs: { bars: change === null ? [] : Array.from({ length: 22 }, (_, i) => ({ close: i === 21 ? 100 + change : 100 })) } },
});

describe("HeatmapBento", () => {
  it("links all four tiles to sector cards and shows exact breadth and coverage", () => {
    const rows = [row("A", "Technology", 4), row("B", "Technology", null), row("C", "Energy", -2)];
    const markup = renderToStaticMarkup(<HeatmapBento locale="en" metric="1m" summary={summarizeHeatmap(aggregateSectors(rows, "1m"), rows)} />);
    expect(markup.match(/href="#sector-/g)).toHaveLength(4);
    expect(markup).toContain("1 up · 1 down · 0 flat");
    expect(markup).toContain("1 without data");
    expect(markup).toContain("2</span><span class=");
  });
  it("uses Slovak copy and known rule counts", () => {
    const rows = [row("A", "Technology", null)];
    rows[0].result.ruleHits = [{ id: "a", label: "", points: 1, matched: true, detail: "" }, { id: "b", label: "", points: 1, matched: false, detail: "" }];
    const markup = renderToStaticMarkup(<HeatmapBento locale="sk" metric="rules" summary={summarizeHeatmap(aggregateSectors(rows, "rules"), rows)} />);
    expect(markup).toContain("1 z 2 známych pravidiel splnených");
    expect(markup).toContain("0 bez údajov");
  });
  it("keeps the signed decimal average in both locales", () => {
    const rows = [row("A", "Technology", 0.4)];
    const summary = summarizeHeatmap(aggregateSectors(rows, "1m"), rows);
    expect(renderToStaticMarkup(<HeatmapBento locale="en" metric="1m" summary={summary} />)).toContain("+<span data-motion=\"run\" class=\"kit-count\"");
    expect(renderToStaticMarkup(<HeatmapBento locale="en" metric="1m" summary={summary} />)).toContain(".4%");
    expect(renderToStaticMarkup(<HeatmapBento locale="sk" metric="1m" summary={summary} />)).toContain(",4%");
  });
});
