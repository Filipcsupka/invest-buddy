import { describe, expect, it } from "vitest";
import { aggregateSectors, intensity, parseMetric, priceChange, rulesShare, type HeatInput } from "./aggregate";

const bars = (closes: number[]) => closes.map((close) => ({ close }));
const row = (ticker: string, sector: string, closes: number[], hits: [boolean, boolean?][] = [], state = "Watch"): HeatInput => ({
  instrument: { ticker, name: ticker, sector },
  result: { state: state as HeatInput["result"]["state"], ruleHits: hits.map(([matched, unknown], i) => ({ id: `r${i}`, label: "", points: 1, matched, detail: "", ...(unknown ? { unknown: true } : {}) })), inputs: { bars: bars(closes) } },
});
const ramp = (n: number, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);

describe("parseMetric", () => {
  it("accepts known values and falls back to 1m", () => {
    expect(parseMetric("3m")).toBe("3m");
    expect(parseMetric("rules")).toBe("rules");
    expect(parseMetric(["3m", "rules"])).toBe("3m");
    expect(parseMetric("nope")).toBe("1m");
    expect(parseMetric(undefined)).toBe("1m");
  });
});

describe("priceChange", () => {
  it("computes the change over the window", () => expect(priceChange(bars(ramp(22)), 21)).toBe(21));
  it("is null with too little history or unusable prices", () => {
    expect(priceChange(bars(ramp(21)), 21)).toBeNull();
    expect(priceChange(bars([]), 21)).toBeNull();
    expect(priceChange(bars([0, ...ramp(21, 5)]), 21)).toBeNull();
    expect(priceChange(bars([NaN, ...ramp(21, 5)]), 21)).toBeNull();
  });
});

describe("rulesShare", () => {
  it("counts met rules among rules with data", () => expect(rulesShare(row("A", "S", [], [[true], [false], [true, true], [true]]).result)).toBeCloseTo(66.7, 1));
  it("is null for unscored tickers and when no rule had data", () => {
    expect(rulesShare(row("A", "S", [], [[true]], "Insufficient/invalid data").result)).toBeNull();
    expect(rulesShare(row("A", "S", [], [[false, true]]).result)).toBeNull();
    expect(rulesShare(row("A", "S", [], []).result)).toBeNull();
  });
});

describe("aggregateSectors", () => {
  it("groups by sector, averages values with data, and sorts alphabetically", () => {
    const rows = [row("B", "Tech", ramp(22)), row("A", "Tech", ramp(22, 100, 2)), row("C", "Bio", ramp(22, 200, -1))];
    const out = aggregateSectors(rows, "1m");
    expect(out.map((s) => s.sector)).toEqual(["Bio", "Tech"]);
    expect(out[1].cells.map((c) => c.ticker)).toEqual(["A", "B"]);
    expect(out[1].average).toBe(31.5);
    expect(out[0].average).toBeLessThan(0);
  });
  it("keeps a sector whose tickers all lack prices, with a null average", () => {
    const [sector] = aggregateSectors([row("A", "Tech", ramp(5)), row("B", "Tech", [])], "3m");
    expect(sector).toMatchObject({ average: null, counted: 0 });
    expect(sector.cells).toHaveLength(2);
  });
  it("averages only tickers with data when some prices are missing", () => {
    const [sector] = aggregateSectors([row("A", "Tech", ramp(22)), row("B", "Tech", ramp(3))], "1m");
    expect(sector).toMatchObject({ average: 21, counted: 1 });
    expect(sector.cells.find((c) => c.ticker === "B")?.value).toBeNull();
  });
  it("returns nothing for an empty universe", () => expect(aggregateSectors([], "rules")).toEqual([]));
  it("uses rules share for the rules metric", () => {
    const [sector] = aggregateSectors([row("A", "Tech", [], [[true], [false]])], "rules");
    expect(sector.average).toBe(50);
  });
});

describe("intensity", () => {
  it("steps price change by size and halves the scale for 3m", () => {
    expect(intensity("1m", 0.4)).toBe(0);
    expect(intensity("1m", -2)).toBe(1);
    expect(intensity("1m", 5)).toBe(2);
    expect(intensity("1m", -8)).toBe(3);
    expect(intensity("1m", 25)).toBe(4);
    expect(intensity("3m", 5)).toBe(1);
  });
  it("steps rules share in fifths", () => {
    expect(intensity("rules", 0)).toBe(0);
    expect(intensity("rules", 59)).toBe(2);
    expect(intensity("rules", 100)).toBe(4);
  });
});
