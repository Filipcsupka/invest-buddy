import { describe, expect, it } from "vitest";
import type { StoreRow } from "@/data/store";
import { getScannerFloorMessages, hiddenText } from "@/i18n/scanner-floor-messages";
import { DISCOVERY } from "@/jobs/discovery-config";
import { filterScores, filtersHref, hasFilters, parseFilters } from "./filters";
import { floorMetrics, floorState, SCANNER_FLOOR, type FloorMetrics } from "./floor";

const row = (ticker: string, total: number) => ({ instrument: { ticker, name: ticker, sector: "Cloud", source: "guide" }, result: { state: "Watch", total, fundamentals: 5, technical: 5, macro: 2 } }) as unknown as StoreRow;
const rows = [row("BIG", 20), row("THIN", 19), row("SMALL", 18), row("NODATA", 17), row("HELD", 16), row("HALF", 15)];
const metrics: Record<string, FloorMetrics> = {
  BIG: { avgDollarVolume: 50_000_000, marketCap: 5_000_000_000 },
  THIN: { avgDollarVolume: 500_000, marketCap: 5_000_000_000 },
  SMALL: { avgDollarVolume: 50_000_000, marketCap: 100_000_000 },
  NODATA: { avgDollarVolume: null, marketCap: null },
  HELD: { avgDollarVolume: 100_000, marketCap: 10_000_000 },
  HALF: { avgDollarVolume: 50_000_000, marketCap: null },
};
const tickers = (query: Record<string, string>, held: string[] = ["HELD"]) => filterScores(rows, parseFilters(query), new Set(held), "en", {}, metrics).map((r) => r.instrument.ticker);

describe("scanner floor", () => {
  it("uses the discovery screen values", () => {
    expect(SCANNER_FLOOR).toEqual({ minAvgDollarVolumeUsd: DISCOVERY.minAvgDollarVolumeUsd, minMarketCapUsd: DISCOVERY.minMarketCapUsd, days: DISCOVERY.avgDollarVolumeDays });
    expect(SCANNER_FLOOR.minAvgDollarVolumeUsd).toBe(2_000_000);
  });

  it("is on by default: hides names below a known floor, keeps unknown and held, order unchanged", () => {
    expect(parseFilters({}).floor).toBe(true);
    expect(tickers({})).toEqual(["BIG", "NODATA", "HELD", "HALF"]);
  });

  it("shows every row with floor=off and treats other values as on", () => {
    expect(tickers({ floor: "off" })).toEqual(["BIG", "THIN", "SMALL", "NODATA", "HELD", "HALF"]);
    expect(tickers({ floor: "on" })).toEqual(tickers({}));
  });

  it("never hides a ticker without metrics", () => {
    expect(filterScores(rows, parseFilters({}), new Set(), "en", {}, {}).length).toBe(rows.length);
    expect(floorState(undefined)).toBe("unknown");
    expect(floorState(metrics.HALF)).toBe("unknown");
    expect(floorState(metrics.BIG)).toBe("ok");
    expect(floorState(metrics.THIN)).toBe("below");
  });

  it("computes the metrics from bars and shares, null when missing", () => {
    const bars = Array.from({ length: 20 }, () => ({ close: 10, volume: 300_000 }));
    expect(floorMetrics(bars, 40_000_000)).toEqual({ avgDollarVolume: 3_000_000, marketCap: 400_000_000 });
    expect(floorMetrics(bars.slice(1), null)).toEqual({ avgDollarVolume: null, marketCap: null });
    expect(floorMetrics([...bars.slice(1), { close: 10, volume: Number.NaN }], 0).avgDollarVolume).toBeNull();
  });

  it("is URL visible: floor=off counts as a filter and links toggle it", () => {
    expect(hasFilters(parseFilters({}))).toBe(false);
    expect(hasFilters(parseFilters({ floor: "off" }))).toBe(true);
    const filters = parseFilters({ sector: "Cloud", sort: "ticker" });
    expect(filtersHref("en", filters, false)).toBe("/en/scanner?sector=Cloud&sort=ticker&floor=off");
    expect(filtersHref("sk", parseFilters({ floor: "off" }), true)).toBe("/sk/scanner");
  });

  it("has matching EN and SK keys, plural forms and no advice wording", () => {
    const en = getScannerFloorMessages("en"), sk = getScannerFloorMessages("sk");
    expect(Object.keys(sk).sort()).toEqual(Object.keys(en).sort());
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(ph(sk[key]), key).toBe(ph(en[key]));
    expect(hiddenText("sk", 1)).toContain("1 ticker je");
    expect(hiddenText("sk", 3)).toContain("3 tickery sú");
    expect(hiddenText("sk", 5)).toContain("5 tickerov je");
    expect(hiddenText("en", 1)).toContain("1 ticker is");
    expect(hiddenText("en", 2)).toContain("2 tickers are");
    const banned = /\bbuy\b|\bsell\b|recommend|hot stocks?|opportunit|\bbest\b|top picks?|\bkúp\w*|\bpredaj\w*|\bpredať|odporúč(?!anie)\w*|príležitos\w*|najlepš\w*|horúc\w*/i;
    for (const text of [...Object.values(en), ...Object.values(sk)]) expect(text).not.toMatch(banned);
  });
});
