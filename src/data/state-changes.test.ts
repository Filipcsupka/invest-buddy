import { describe, expect, it } from "vitest";
import { diffStates } from "./state-changes";

describe("diffStates", () => {
  const row = (ticker: string, asOf: string, state: "Watch" | "Wait" | "Setup met (>=18)") => ({ ticker, asOf, state });
  it("keeps only tickers whose state moved on the newest day", () => {
    const out = diffStates([
      row("AAA", "2026-10-15", "Wait"), row("AAA", "2026-10-16", "Watch"),
      row("BBB", "2026-10-15", "Watch"), row("BBB", "2026-10-16", "Watch"),
      row("CCC", "2026-10-14", "Wait"), row("CCC", "2026-10-15", "Setup met (>=18)"),
      row("DDD", "2026-10-16", "Watch"),
    ], "2026-10-16");
    expect(out).toEqual([{ ticker: "AAA", from: "wait", to: "watch", asOf: "2026-10-16" }]);
  });
});
