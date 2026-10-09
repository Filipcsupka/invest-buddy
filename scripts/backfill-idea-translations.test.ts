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
  it("accepts Slovak decimal commas and grouped thousands but rejects changed figures", async () => {
    const source = { ...row, verdict: "RSI 70.7; revenue 1,200.50", what_happened: ["Return 3.54%", "Volume 50,000.12"] };
    const translated = { ...translation, verdict: "RSI 70,7; tržby 1.200,50", whatHappened: ["Výnos 3,54%", "Objem 50 000,12"] };
    const update = vi.fn(async () => {}), lines: string[] = [];
    expect(await processBackfillRows([source], true, async () => translated, update, (line) => lines.push(line))).toBe(0);
    expect(update).toHaveBeenCalledOnce();
    expect(await processBackfillRows([source], true, async () => ({ ...translated, verdict: "RSI 70,8; tržby 1.200,50" }), update, (line) => lines.push(line))).toBe(1);
    expect(update).toHaveBeenCalledOnce();
    expect(lines).toEqual(["1 NVDA: updated", "1 NVDA: verdict figures changed"]);
  });
  it("rejects changed quarter, fiscal and moving-average tokens", async () => {
    const source = { ...row, verdict: "Q3 FY2026 above MA200, RSI steady versus SPY" };
    const translated = { ...translation, verdict: "Q4 FY2027 nad MA50, RSI stabilné oproti SPY" };
    const update = vi.fn(async () => {}), lines: string[] = [];
    expect(await processBackfillRows([source], true, async () => translated, update, (line) => lines.push(line))).toBe(1);
    expect(update).not.toHaveBeenCalled();
    expect(lines).toEqual(["1 NVDA: verdict figures changed"]);
  });
});
