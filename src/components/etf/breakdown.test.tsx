import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { EtfScoreResult } from "@/engine/etf-score";
import { EtfRuleBreakdown } from "./breakdown";

it("shows specific gaps and gives numeric rule values their actual units", () => {
  const score = { rules: [
    { id: "aum", group: "size", max: 8, earned: 0, evidenced: false, value: null, gapReason: "missing_fx" },
    { id: "benchmark6m", group: "trend", max: 4, earned: 0, evidenced: false, value: 0.04, gapReason: "missing_benchmark_proxy" },
    { id: "peerTer", group: "cost", max: 8, earned: 4, evidenced: true, value: 25 },
    { id: "age", group: "size", max: 4, earned: 2, evidenced: true, value: 7 },
    { id: "sma200", group: "trend", max: 3, earned: 3, evidenced: true, value: 100 },
  ] } as EtfScoreResult;
  const html = renderToStaticMarkup(<EtfRuleBreakdown locale="en" score={score} />);
  expect(html).toContain("Exchange rate unavailable");
  expect(html).toContain("Benchmark proxy unavailable");
  expect(html).toContain("25 percentile");
  expect(html).toContain("Close: 100.00");
  expect(html).not.toContain("7.00");
});
