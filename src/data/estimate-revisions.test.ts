import { describe, expect, it } from "vitest";
import { estimateRevision, formatEstimateRevision, nextReport, BASELINE_TOLERANCE_DAYS, ESTIMATE_REVISION_POINTS, type EstimateObservation } from "./estimate-revisions";
import { canDisplay } from "./sources-registry";

const asOf = "2026-10-19";
const row = (observedOn: string, estimate: number | null, over: Partial<EstimateObservation> = {}): EstimateObservation =>
  ({ observedOn, reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", estimate, ...over });

describe("nextReport", () => {
  it("takes the earliest upcoming report from the newest pull on or before asOf", () => {
    const rows = [row("2026-10-18", 1.1), row("2026-10-18", 1.4, { reportDate: "2027-02-05", fiscalDateEnding: "2026-12-31" }), row("2026-10-19", 1.2), row("2026-10-20", 9)];
    expect(nextReport(rows, asOf)).toEqual(row("2026-10-19", 1.2));
  });
  it("ignores reports already past and pulls after asOf", () => {
    expect(nextReport([row("2026-10-19", 1, { reportDate: "2026-10-10" })], asOf)).toBeNull();
    expect(nextReport([row("2026-10-20", 1)], asOf)).toBeNull();
    expect(nextReport([], asOf)).toBeNull();
  });
});

describe("estimateRevision", () => {
  const rows = [row("2026-07-21", 1.0), row("2026-08-20", 1.25), row("2026-09-19", 1.25), row("2026-10-19", 1.3)];

  it("reports 30, 60 and 90 day changes for the next report with zero points", () => {
    const fact = estimateRevision("NVDA", rows, asOf)!;
    expect(fact).toMatchObject({ ticker: "NVDA", reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", currentObservedOn: asOf, currentEstimate: 1.3, sourceId: "alphavantage", points: 0 });
    expect(ESTIMATE_REVISION_POINTS).toBe(0);
    expect(fact.windows).toEqual([
      { days: 30, fromObservedOn: "2026-09-19", fromEstimate: 1.25, change: 0.05, changePct: 4, direction: "up" },
      { days: 60, fromObservedOn: "2026-08-20", fromEstimate: 1.25, change: 0.05, changePct: 4, direction: "up" },
      { days: 90, fromObservedOn: "2026-07-21", fromEstimate: 1, change: 0.3, changePct: 30, direction: "up" },
    ]);
  });

  it("marks cuts and unchanged estimates", () => {
    const fact = estimateRevision("X", [row("2026-09-19", 2), row("2026-08-20", 1.2), row(asOf, 1.2)], asOf)!;
    expect(fact.windows[0]).toMatchObject({ change: -0.8, changePct: -40, direction: "down" });
    expect(fact.windows[1]).toMatchObject({ change: 0, changePct: 0, direction: "flat" });
  });

  it("uses the newest baseline on or before the window start, within the tolerance", () => {
    const fact = estimateRevision("X", [row("2026-09-12", 1), row("2026-09-18", 1.1), row("2026-09-25", 5), row(asOf, 1.21)], asOf)!;
    expect(fact.windows[0]).toMatchObject({ fromObservedOn: "2026-09-18", fromEstimate: 1.1, change: 0.11, changePct: 10 });
    const tooOld = estimateRevision("X", [row(`2026-09-${String(19 - BASELINE_TOLERANCE_DAYS - 1).padStart(2, "0")}`, 1), row(asOf, 1.2)], asOf)!;
    expect(tooOld.windows[0]).toEqual({ days: 30, fromObservedOn: null, fromEstimate: null, change: null, changePct: null, direction: null });
  });

  it("matches a moved report date by fiscal quarter and keeps other quarters apart", () => {
    const moved = estimateRevision("X", [row("2026-09-19", 1, { reportDate: "2026-10-15" }), row(asOf, 1.1, { reportDate: "2026-10-29" })], asOf)!;
    expect(moved).toMatchObject({ reportDate: "2026-10-29" });
    expect(moved.windows[0]).toMatchObject({ fromEstimate: 1, change: 0.1, changePct: 10 });
    const otherQuarter = estimateRevision("X", [row("2026-09-19", 1, { fiscalDateEnding: "2026-06-30" }), row(asOf, 1.1)], asOf)!;
    expect(otherQuarter.windows[0].change).toBeNull();
  });

  it("falls back to the report date when a row has no fiscal quarter", () => {
    const fact = estimateRevision("X", [row("2026-09-19", 1, { fiscalDateEnding: null }), row(asOf, 1.5, { fiscalDateEnding: null })], asOf)!;
    expect(fact.windows[0]).toMatchObject({ change: 0.5, changePct: 50 });
  });

  it("leaves change null when an estimate is missing and percent null on a zero baseline", () => {
    expect(estimateRevision("X", [row("2026-09-19", 1), row(asOf, null)], asOf)!.windows[0]).toMatchObject({ fromEstimate: 1, change: null, direction: null });
    expect(estimateRevision("X", [row("2026-09-19", null), row(asOf, 1)], asOf)!.windows[0]).toMatchObject({ fromObservedOn: null, change: null });
    expect(estimateRevision("X", [row("2026-09-19", 0), row(asOf, 0.1)], asOf)!.windows[0]).toMatchObject({ change: 0.1, changePct: null, direction: "up" });
  });

  it("does not read rows observed after asOf", () => {
    const fact = estimateRevision("X", [row("2026-09-19", 1), row("2026-10-01", 1.2), row("2026-10-25", 3)], "2026-10-01")!;
    expect(fact.currentEstimate).toBe(1.2);
    expect(fact.windows[0].fromObservedOn).toBeNull();
  });

  it("is null without an upcoming report", () => {
    expect(estimateRevision("X", [], asOf)).toBeNull();
  });
});

describe("formatEstimateRevision", () => {
  const fact = estimateRevision("NVDA", [row("2026-07-21", 1.25), row("2026-09-19", 1.25), row(asOf, 1.3)], asOf)!;

  it("writes one plain owner line with no action words", () => {
    const line = formatEstimateRevision(fact, "owner")!;
    expect(line).toBe("Next report 2026-11-05: EPS estimate 1.30; 30d +0.05 (+4.00%), 60d n/a, 90d +0.05 (+4.00%). Alpha Vantage, not scored.");
    expect(line).not.toMatch(/\b(buy|sell|start|add|trim|hold|wait)\b/i);
  });

  it("gives public output nothing while Alpha Vantage may not be displayed", () => {
    expect(canDisplay("alphavantage")).toBe(false);
    expect(formatEstimateRevision(fact, "public")).toBeNull();
  });
});


it("keeps EODHD estimate revisions separate from Alpha Vantage", () => {
  const rows: EstimateObservation[] = [
    row("2026-09-19", 1, { sourceId: "alphavantage" }),
    row("2026-09-19", 1.1, { sourceId: "eodhd" }),
    row(asOf, 1.3, { sourceId: "eodhd" }),
  ];
  const fact = estimateRevision("NVDA", rows, asOf)!;
  expect(fact.sourceId).toBe("eodhd");
  expect(fact.windows[0].fromEstimate).toBe(1.1);
  expect(formatEstimateRevision(fact, "owner")).toContain("EODHD");
  expect(formatEstimateRevision(fact, "public")).toBeNull();
});
