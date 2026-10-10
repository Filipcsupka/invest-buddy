import { expect, it } from "vitest";
import { catalystReviewSymbols, gateSymbols, relevantFiling, type CatalystConsensus } from "./detect";
import { GATE } from "./gate-config";

it("gates product events in Item 7.01 and 8.01 filings", () => {
  expect(relevantFiling({ form: "8-K", items: "7.01,9.01" })).toBe(true);
  expect(relevantFiling({ form: "8-K/A", items: "8.01" })).toBe(true);
});

it("selects missing, unknown and stale catalyst consensus without new filings and respects the nightly cap", () => {
  const today = "2026-10-10";
  const rows: CatalystConsensus[] = Array.from({ length: 9 }, (_, i) => ({ symbol: `T${i}`, asOf: null, value: null }));
  rows.push({ symbol: "OLD", asOf: "2026-10-02", value: true });
  rows.push({ symbol: "FRESH", asOf: "2026-10-03", value: true });
  const selected = catalystReviewSymbols(rows, today);
  expect(selected).toHaveLength(GATE.catalystReviewPerNight);
  expect(selected).toEqual(["T0", "T1", "T2", "T3", "T4", "T5"]);
  const gate = gateSymbols({ today, filings: [], insiders: [], drawdowns: [], valuations: [], catalystReviews: selected }, rows.map((r) => r.symbol));
  expect(gate.symbols).toEqual(selected);
  expect(gate.reasons.T0).toContain("catalyst review due");
  expect(catalystReviewSymbols([{ symbol: "OLD", asOf: "2026-10-02", value: true }, { symbol: "FRESH", asOf: "2026-10-03", value: false }], today)).toEqual(["OLD"]);
});
