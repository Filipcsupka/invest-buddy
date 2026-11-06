import { describe, expect, it } from "vitest";
import { earningsCatalyst, newsCatalyst, type EodhdNewsEvidence } from "./eodhd-catalyst";
import { catalystFromFact } from "./catalyst";
import type { EstimateObservation } from "./estimate-revisions";

const today = "2026-10-21";
const calendar: EstimateObservation[] = [
  { observedOn: "2026-09-21", reportDate: "2026-10-27", fiscalDateEnding: "2026-09-30", estimate: 1, sourceId: "eodhd" },
  { observedOn: "2026-10-20", reportDate: "2026-10-27", fiscalDateEnding: "2026-09-30", estimate: 1.1, sourceId: "eodhd" },
];
const story = (url: string, over: Partial<EodhdNewsEvidence> = {}): EodhdNewsEvidence => ({
  url, publishedAt: "2026-10-19T09:00:00Z", title: `Product launch ${url}`, tags: ["PRODUCT"], sentiment: 0.8, documentId: 7, ...over,
});

describe("EODHD catalyst rule", () => {
  it("needs an upcoming report, fresh observation, and 30-day revision from the same vendor", () => {
    expect(earningsCatalyst("ASML", calendar, today)).toMatchObject({ kind: "earnings_revision", reportDate: "2026-10-27" });
    expect(earningsCatalyst("ASML", calendar, "2026-09-21")).toBeNull(); // Later revision cannot leak backwards.
    expect(earningsCatalyst("ASML", calendar, "2026-10-28")).toBeNull();
    expect(earningsCatalyst("ASML", calendar.map((r) => ({ ...r, sourceId: "alphavantage" })), today)).toBeNull();
    expect(earningsCatalyst("ASML", [{ ...calendar[0], observedOn: "2026-10-01" }, calendar[1]], today)).toBeNull();
  });

  it("requires two distinct recent articles with strong polarity and catalyst tags", () => {
    const rows = [story("https://example.com/1"), story("https://example.com/2", { documentId: 8 })];
    expect(newsCatalyst(rows, today)).toMatchObject({ kind: "news_cluster", evidenceCount: 2, documentIds: [7, 8] });
    expect(newsCatalyst([rows[0], story(rows[0].url)], today)).toBeNull();
    expect(newsCatalyst([rows[0], story("https://example.com/3", { tags: ["STOCK-MARKET"] })], today)).toBeNull();
    expect(newsCatalyst([rows[0], story("https://example.com/3", { sentiment: 0.4 })], today)).toBeNull();
    expect(newsCatalyst([rows[0], story("https://example.com/3", { publishedAt: "2026-10-22T00:00:00Z" })], today)).toBeNull();
  });

  it("reads EODHD facts through the existing key without showing vendor evidence", () => {
    const value = earningsCatalyst("ASML", calendar, today)!;
    expect(catalystFromFact({ asOf: today, value }, today)).toMatchObject({ value: true, refs: [] });
    expect(catalystFromFact({ asOf: today, value }, "2026-10-20")).toBeNull();
    expect(catalystFromFact({ asOf: today, value }, "2026-10-28")).toBeNull();
    expect(catalystFromFact({ asOf: "2026-10-21", value: { ...value, observedOn: "2026-10-22" } }, today)).toBeNull();
  });

  it("counts one story once even when its URL, case or punctuation differ", () => {
    expect(newsCatalyst([story("https://a.example.com/1"), story("https://b.example.com/2", { title: "PRODUCT  launch https a example com 1!" })], today)).toBeNull();
    expect(newsCatalyst([story("https://a.example.com/1"), story("https://b.example.com/2", { title: "Other launch" })], today)).toMatchObject({ evidenceCount: 2 });
  });
});
