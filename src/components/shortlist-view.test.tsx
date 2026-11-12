import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildShortlist, sectorConcentration, type ShortlistInput } from "@/engine/shortlist";
import type { ShortlistData } from "@/data/shortlist";
import { groupOrder, methodText, rowMarkers, sectorGroupLabel, ShortlistLock, ShortlistView, tieBreakValue } from "./shortlist-view";

const bars = (end: number) => Array.from({ length: 64 }, (_, i) => { const close = 50 + (end - 50) * i / 63; return { close, high: close * 1.01, low: close * 0.99, volume: 1_000_000 }; });
const input = (ticker: string, over: Partial<ShortlistInput> = {}): ShortlistInput =>
  ({ ticker, displayState: "setup", percent: 80, evidencedPoints: 23, bars: bars(100), currency: "USD", reportDate: null, sector: "Technology", ...over });
const field = Array.from({ length: 20 }, (_, i) => input(`W${i}`, { displayState: "wait", bars: bars(40 + i) }));

function data(inputs: ShortlistInput[]): ShortlistData {
  const shortlist = buildShortlist("2026-11-10", [...field, ...inputs]);
  return { shortlist, concentration: sectorConcentration(shortlist.kept), names: {}, sample: true };
}

describe("shortlist view", () => {
  it("says how many names sit in each sector group and flags a crowded one", () => {
    const names = [...Array.from({ length: 9 }, (_, i) => input(`T${i}`)), ...Array.from({ length: 6 }, (_, i) => input(`H${i}`, { sector: "Healthcare" }))];
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={data(names)} />);
    expect(html).toContain("9 of 15 in Technology");
    expect(html).toContain("6 of 15 in Healthcare");
    expect(html).toContain("More than 30% of this list is in one sector group.");
    const sk = renderToStaticMarkup(<ShortlistView locale="sk" data={data(names)} />);
    expect(sk).toContain("9 z 15 v skupine Technológie");
  });

  it("shows the deciding tie-breaker, not-assessed markers and dropped reasons", () => {
    const view = data([input("TOP", { percent: 90 }), input("NEXT", { currency: "GBX" }), input("LOW", { evidencedPoints: 20 })]);
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={view} />);
    expect(html).toContain("Highest score percent");
    expect(html).toContain("Score percent");
    expect(html).toContain("Traded value: Not assessed");
    expect(html).toContain("Not on the shortlist (1)");
    expect(html).toContain("Too few rules have data.");
    expect(html).toContain(methodText("en"));
    expect(methodText("en")).toContain("at least 23 of 25 points with data");
    expect(methodText("en")).toContain("top 20%");
  });

  it("formats each tie-breaker value", () => {
    const view = data([input("A"), input("B", { reportDate: "2026-11-12" })]);
    const [a, b] = view.shortlist.kept;
    expect(tieBreakValue("en", a, "rs")).toMatch(/^RS percentile \d+$/);
    expect(tieBreakValue("en", a, "atr")).toMatch(/^Daily range [\d.]+%$/);
    expect(tieBreakValue("en", a, "tradedValue")).toMatch(/^Traded value [\d.]+[mM] USD a day$/);
    expect(tieBreakValue("en", a, "ticker")).toBeNull();
    expect(rowMarkers("en", b)).toContain("Earnings report within 5 sessions.");
    expect(rowMarkers("en", a)).toContain("Earnings report: Not assessed");
  });

  it("renders the compact dashboard block with a link to the full list", () => {
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={data([input("A"), input("B")])} compact limit={1} />);
    expect(html).toContain('data-shortlist="compact"');
    expect(html).toContain('href="/en/scanner#shortlist"');
    expect(html).toContain(">A<");
    expect(html).not.toContain(">B<");
  });

  it("names the empty state and the lock card", () => {
    expect(renderToStaticMarkup(<ShortlistView locale="en" data={data([])} />)).toContain("No Conditions met name is left on the shortlist today.");
    expect(renderToStaticMarkup(<ShortlistLock locale="sk" />)).toContain('data-tier-lock="scanner-shortlist"');
    expect(sectorGroupLabel("sk", "Unknown")).toBe("Neznámy sektor");
    expect(sectorGroupLabel("en", "Growth")).toBe("Growth");
  });
});

describe("shortlist view, review fixes", () => {
  it("says kept names failed no check and that missing data does not remove a name", () => {
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={data([input("A")])} />);
    expect(html).toContain("1 of 1 Conditions met names failed no check");
    expect(html).toContain("A check without data is marked not assessed and does not remove a name.");
    expect(html).not.toContain("pass the checks");
    const sk = renderToStaticMarkup(<ShortlistView locale="sk" data={data([input("A")])} />);
    expect(sk).toContain("nezlyhali v žiadnej kontrole");
  });

  it("shows not-assessed markers and F3 flags on dropped rows", () => {
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={data([input("LOW", { evidencedPoints: 20, currency: "GBX", reportDate: "2026-11-12" })])} />);
    const dropped = html.slice(html.indexOf("Not on the shortlist"));
    expect(dropped).toContain("Too few rules have data.");
    expect(dropped).toContain("Traded value: Not assessed");
    expect(dropped).toContain("Earnings report within 5 sessions.");
  });

  it("labels the order against the row above inside the same sector group", () => {
    // Global order TOP (Tech), MID (Health, by percent), LOW (Tech, by percent). Inside Technology, LOW sits under TOP.
    const view = data([input("TOP", { percent: 95 }), input("MID", { percent: 90, sector: "Healthcare" }), input("LOW", { percent: 85 })]);
    const tech = view.shortlist.kept.filter((row) => row.sector === "Technology");
    expect(groupOrder(tech).map(({ row, key, first }) => [row.ticker, key, first])).toEqual([["TOP", null, "overall"], ["LOW", "percent", null]]);
    const health = view.shortlist.kept.filter((row) => row.sector === "Healthcare");
    expect(groupOrder(health)[0]).toMatchObject({ key: null, first: "group" });
    const html = renderToStaticMarkup(<ShortlistView locale="en" data={view} />);
    expect(html).toContain("First in this sector group");
  });

  it("keeps the review sentence out of the lock card", () => {
    const html = renderToStaticMarkup(<ShortlistLock locale="en" />);
    expect(html).toContain("A ranked shortlist of Conditions met names, grouped by sector.");
    expect(html).not.toContain("Order decided by");
  });
});
