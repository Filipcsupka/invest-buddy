import { describe, expect, it, vi } from "vitest";
import { parseBackfillArgs, processBackfillRows } from "./backfill-idea-translations";

const row = { id: "1", symbol: "NVDA", verdict: "v", what_happened: ["a", "b"], why_it_matters: ["c"], numbers: [{ label: "one", value: "1" }, { label: "two", value: "2" }, { label: "three", value: "3" }], plan: { amountNow: "x", trigger: "t", invalidation: "i", opportunityCost: "o" }, evidence_urls: [], conflict_note: null };
const translation = { verdict: "v", whatHappened: ["a", "b"], whyItMatters: ["c"], numbers: row.numbers, plan: row.plan, evidence: [], conflictNote: null };

describe("idea translation backfill", () => {
  it("defaults to listing rows without a model call or write and parses a limit", async () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, limit: null });
    expect(parseBackfillArgs(["--limit", "2"])).toEqual({ apply: false, limit: 2 });
    expect(() => parseBackfillArgs(["--limit", "0"])).toThrow();
    const translate = vi.fn(async () => translation), update = vi.fn(async () => {}), lines: string[] = [];
    expect(await processBackfillRows([row], false, translate, update, (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual(["1 NVDA: pending"]);
    expect(translate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("continues after a failed row", async () => {
    const translate = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(translation);
    const update = vi.fn(async () => {}), lines: string[] = [];
    expect(await processBackfillRows([row, { ...row, id: "2", symbol: "AMD" }], true, translate, update, (line) => lines.push(line))).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(lines).toEqual(["1 NVDA: failed", "2 AMD: updated"]);
  });
});
