import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerformanceChart, PerformanceKpis, summarize, tone } from "./portfolio-chart";

const points = [
  { date: "2026-01-02", portfolio: 100, benchmark: 100 },
  { date: "2026-02-02", portfolio: 108, benchmark: 103 },
  { date: "2026-03-02", portfolio: 97.2, benchmark: 101 },
  { date: "2026-04-02", portfolio: 112, benchmark: 106 },
];

describe("portfolio performance", () => {
  it("summarises return, benchmark gap and the deepest fall from a peak", () => {
    const s = summarize(points)!;
    expect(s.portfolioPct).toBeCloseTo(12, 5);
    expect(s.benchmarkPct).toBeCloseTo(6, 5);
    expect(s.diffPct).toBeCloseTo(6, 5);
    expect(s.maxDrawdownPct).toBeCloseTo((97.2 / 108 - 1) * 100, 5);
    expect(s.drawdownDate).toBe("2026-03-02");
    expect(summarize([])).toBeNull();
  });

  it("colours by sign", () => {
    expect(tone(3)).toBe("gain");
    expect(tone(-0.4)).toBe("loss");
    expect(tone(0)).toBe("flat");
    expect(tone(null)).toBe("flat");
  });

  it("draws a labelled zero line and both areas", () => {
    const html = renderToStaticMarkup(<PerformanceChart locale="en" points={points} label="chart" />);
    expect(html).toContain("pc-zero");
    expect(html).toContain("pc-area-gain");
    expect(html).toContain("pc-area-loss");
    expect(html).toContain("0 %");
  });

  it("shows the current return as a signed number", () => {
    const text = { current: "Return", since: "since", benchmark: "SPY", difference: "vs SPY", drawdown: "Drop", ahead: "ahead", behind: "behind" };
    const html = renderToStaticMarkup(<PerformanceKpis locale="en" summary={summarize(points)!} text={text} />);
    expect(html).toContain("+12.00 %");
    expect(html).toContain('data-tone="gain"');
    expect(html).toContain("ahead");
  });
});
