import { describe, expect, it } from "vitest";
import {
  catalystCalendar, daysBetween, futureFindings, nextEarnings, normaliseTimeOfDay, preEarningsFlags,
  type EarningsSnapshotRow, type FutureFindingRow, type NextEarnings,
} from "./catalyst-calendar";

const snap = (ticker: string, observedOn: string, reportDate: string, extra: Partial<EarningsSnapshotRow> = {}): EarningsSnapshotRow =>
  ({ ticker, observedOn, reportDate, fiscalDateEnding: "2026-09-30", timeOfDay: "post-market", ...extra });
const finding = (id: number, symbol: string, eventDate: string, extra: Partial<FutureFindingRow> = {}): FutureFindingRow =>
  ({ id, symbol, kind: "regulatory", claim: `${symbol} PDUFA date`, eventDate, confirmed: true, dedupeKey: `${symbol}|${id}`, verifiedAt: "2026-10-18T08:00:00.000000Z", ...extra });

describe("normaliseTimeOfDay", () => {
  it("maps the Alpha Vantage forms and leaves the rest unknown", () => {
    expect(normaliseTimeOfDay("pre-market")).toBe("pre-market");
    expect(normaliseTimeOfDay("BMO")).toBe("pre-market");
    expect(normaliseTimeOfDay("post-market")).toBe("post-market");
    expect(normaliseTimeOfDay("amc")).toBe("post-market");
    expect(normaliseTimeOfDay("")).toBeNull();
    expect(normaliseTimeOfDay(null)).toBeNull();
    expect(normaliseTimeOfDay("during")).toBeNull();
  });
});

describe("nextEarnings", () => {
  it("takes the earliest date ahead from the ticker's newest pull and reports a moved date once", () => {
    const rows = [
      snap("NVDA", "2026-10-10", "2026-11-12"),
      snap("NVDA", "2026-10-19", "2026-11-19", { timeOfDay: "pre-market" }),
      snap("NVDA", "2026-10-19", "2027-02-25", { fiscalDateEnding: "2026-12-31" }),
      snap("AMD", "2026-10-19", "2026-10-28"),
    ];
    expect(nextEarnings(rows, "2026-10-19")).toEqual([
      { ticker: "AMD", reportDate: "2026-10-28", timeOfDay: "post-market", fiscalDateEnding: "2026-09-30", observedOn: "2026-10-19", daysUntil: 9, stale: false, previousReportDate: null },
      { ticker: "NVDA", reportDate: "2026-11-19", timeOfDay: "pre-market", fiscalDateEnding: "2026-09-30", observedOn: "2026-10-19", daysUntil: 31, stale: false, previousReportDate: "2026-11-12" },
    ]);
  });

  it("ignores pulls after asOf and dates already past", () => {
    const rows = [snap("CRWD", "2026-10-01", "2026-10-15"), snap("CRWD", "2026-10-20", "2026-12-02")];
    expect(nextEarnings(rows, "2026-10-16")).toEqual([]);
    expect(nextEarnings(rows, "2026-10-15")[0]).toMatchObject({ reportDate: "2026-10-15", daysUntil: 0 });
  });

  it("marks a ticker stale when the newest pull dropped it or its pull is old", () => {
    const rows = [snap("SNOW", "2026-10-17", "2026-11-25"), snap("NET", "2026-10-18", "2026-11-05")];
    const [net, snow] = nextEarnings(rows, "2026-10-18");
    expect(net).toMatchObject({ ticker: "NET", stale: false });
    expect(snow).toMatchObject({ ticker: "SNOW", stale: true });
    expect(nextEarnings(rows, "2026-10-26").find((e) => e.ticker === "NET")).toMatchObject({ stale: true });
    expect(nextEarnings([snap("NET", "2026-10-18", "2026-11-05")], "2026-10-19", { latestPull: "2026-10-19" })[0].stale).toBe(true);
  });
});

describe("futureFindings", () => {
  it("keeps the horizon and the newest row per dedupe key", () => {
    const rows = [
      finding(1, "VRTX", "2026-12-01", { dedupeKey: "k", verifiedAt: "2026-10-10T00:00:00.000000Z", claim: "old" }),
      finding(2, "VRTX", "2026-12-01", { dedupeKey: "k", verifiedAt: "2026-10-18T00:00:00.000000Z", claim: "new" }),
      finding(3, "VRTX", "2026-10-18"),
      finding(4, "VRTX", "2027-03-01"),
    ];
    expect(futureFindings(rows, "2026-10-19").map((f) => f.claim)).toEqual(["new"]);
    expect(futureFindings(rows, "2026-10-19", 180).map((f) => f.id)).toEqual([2, 4]);
  });
});

describe("catalystCalendar", () => {
  it("merges earnings and research events by date and filters symbols and horizon", () => {
    const next = nextEarnings([snap("AMD", "2026-10-19", "2026-10-28"), snap("NVDA", "2026-10-19", "2026-11-19"), snap("TSLA", "2026-10-19", "2027-01-28")], "2026-10-19");
    const events = catalystCalendar({ next, findings: [finding(7, "AMD", "2026-10-28", { kind: "product" }), finding(8, "CRSP", "2026-11-02")], asOf: "2026-10-19" });
    expect(events.map((e) => [e.type, e.symbol, e.date])).toEqual([
      ["earnings", "AMD", "2026-10-28"], ["research", "AMD", "2026-10-28"], ["research", "CRSP", "2026-11-02"], ["earnings", "NVDA", "2026-11-19"],
    ]);
    expect(events[1]).toMatchObject({ kind: "product", findingId: 7, daysUntil: 9, confirmed: true });
    expect(catalystCalendar({ next, findings: [], asOf: "2026-10-19", horizonDays: 120, symbols: ["TSLA"] }).map((e) => e.symbol)).toEqual(["TSLA"]);
  });
});

describe("preEarningsFlags", () => {
  const next: NextEarnings[] = nextEarnings([
    snap("NVDA", "2026-10-19", "2026-10-26", { timeOfDay: "pre-market" }),
    snap("AMD", "2026-10-19", "2026-10-21"),
    snap("PLTR", "2026-10-19", "2026-10-20"),
    snap("SHOP", "2026-10-19", "2026-11-05"),
  ], "2026-10-19");

  it("flags held and START_READY names reporting within the window; held wins over START_READY", () => {
    expect(preEarningsFlags({ next, held: ["NVDA", "AMD", "SHOP"], startReady: ["AMD", "PLTR"] })).toEqual([
      { symbol: "PLTR", reason: "start_ready", reportDate: "2026-10-20", timeOfDay: "post-market", daysUntil: 1, stale: false },
      { symbol: "AMD", reason: "held", reportDate: "2026-10-21", timeOfDay: "post-market", daysUntil: 2, stale: false },
      { symbol: "NVDA", reason: "held", reportDate: "2026-10-26", timeOfDay: "pre-market", daysUntil: 7, stale: false },
    ]);
  });

  it("uses the window bound and leaves other names out", () => {
    expect(preEarningsFlags({ next, held: ["NVDA"], startReady: [], windowDays: 6 })).toEqual([]);
    expect(preEarningsFlags({ next, held: [], startReady: [] })).toEqual([]);
  });

  it("still flags a stale date and says so", () => {
    const stale = nextEarnings([snap("NVDA", "2026-10-01", "2026-10-22")], "2026-10-19");
    expect(preEarningsFlags({ next: stale, held: ["NVDA"], startReady: [] })).toEqual([expect.objectContaining({ symbol: "NVDA", stale: true })]);
  });
});

it("counts whole calendar days", () => {
  expect(daysBetween("2026-10-19", "2026-10-19")).toBe(0);
  expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  expect(daysBetween("2026-10-20", "2026-10-19")).toBe(-1);
});
