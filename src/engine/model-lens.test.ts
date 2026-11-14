import { describe, expect, it } from "vitest";
import type { SectorGroup } from "@/universe/sector-groups";
import type { Theme } from "@/universe/themes";
import { applyModelLens, modelWeights, orderedRows, rowLens, topNFrom, widenedThemes, type ModelPortfolio } from "./model-lens";
import type { ShortlistRow } from "./shortlist";

const holding = (symbol: string, weightPercent: number, theme: Theme, sector: SectorGroup) => ({ symbol, weightPercent, theme, sector });
/** Shape of the 2026-11-13 snapshot: cloud and AI above 25%, Technology far above 30%, one fund without a theme. */
const model: ModelPortfolio = {
  asOf: "2026-11-13",
  holdings: [
    holding("SNOW", 16, "cloud-software", "Technology"), holding("MSFT", 9, "cloud-software", "Technology"), holding("DDOG", 7, "cloud-software", "Technology"),
    holding("NVDA", 10, "ai-semis", "Technology"), holding("AVGO", 7, "ai-semis", "Technology"), holding("ASML", 5, "ai-semis", "Technology"), holding("AMD", 5, "ai-semis", "Technology"),
    holding("CRWD", 13, "cybersecurity", "Technology"), holding("CSPX", 10, "unknown", "Unknown"), holding("TSLA", 4, "energy-ev", "Consumer Cyclical"),
    holding("CGNX", 2, "robotics", "Technology"), holding("NFLX", 2, "consumer", "Communication Services"), holding("ZERO", 0, "other", "Unknown"),
  ],
};

let counter = 0;
function row(ticker: string, theme: Theme, sector: SectorGroup = "Technology", over: Partial<ShortlistRow> = {}): ShortlistRow {
  counter++;
  return {
    ticker, sector, theme, percent: 90 - counter, evidencedPoints: 25, reportDate: null, checks: [], kept: true, dropReasons: [], notAssessed: [], flags: [],
    rank: counter, decidedBy: counter === 1 ? null : "percent", rsReturnPercent: 10, rsPercentile: 90, tradedValueUsd: 5e6, atrPercent: 2, drawdownPercent: 5, reportSessions: null, ...over,
  };
}
const ranked = (rows: ShortlistRow[]) => rows.map((r, i) => ({ ...r, rank: i + 1 }));

describe("model weights", () => {
  it("sums weights per theme and sector group and flags named keys above the cap", () => {
    const weights = modelWeights(model)!;
    expect(weights.holdings).toBe(12);
    expect(weights.themes.map((share) => [share.key, Math.round(share.weightPercent), share.overCap])).toEqual([
      ["cloud-software", 36, true], ["ai-semis", 30, true], ["cybersecurity", 14, false], ["energy-ev", 4, false], ["consumer", 2, false], ["robotics", 2, false], ["unknown", 11, false],
    ]);
    expect(weights.sectors[0]).toMatchObject({ key: "Technology", overCap: true });
    expect(weights.sectors.find((share) => share.key === "Unknown")?.overCap).toBe(false);
  });

  it("normalizes to the positive weights", () => {
    const weights = modelWeights({ asOf: "2026-11-13", holdings: [holding("A", 30, "ai-semis", "Technology"), holding("B", 10, "healthcare", "Healthcare")] })!;
    expect(weights.themes.map((share) => share.weightPercent)).toEqual([75, 25]);
    expect(weights.themes[1].overCap).toBe(false);
  });

  it("never flags other or Unknown, whatever their weight", () => {
    const weights = modelWeights({ asOf: "2026-11-13", holdings: [holding("BANK", 60, "other", "Financial Services"), holding("ETF", 40, "unknown", "Unknown")] })!;
    expect(weights.themes.every((share) => !share.overCap)).toBe(true);
  });

  it("is null for an empty or all-zero portfolio", () => {
    expect(modelWeights({ asOf: "2026-11-13", holdings: [] })).toBeNull();
    expect(modelWeights({ asOf: "2026-11-13", holdings: [holding("A", 0, "ai-semis", "Technology")] })).toBeNull();
  });

  it("uses the configured caps", () => {
    const weights = modelWeights(model, { themeCapPercent: 40, sectorGroupCapPercent: 95 })!;
    expect(weights.themes.some((share) => share.overCap)).toBe(false);
    expect(weights.sectors.some((share) => share.overCap)).toBe(false);
  });
});

describe("row lens", () => {
  const weights = modelWeights(model)!;
  it("says whether a name brings a new theme, sits below the cap, above it, or has no theme", () => {
    expect(rowLens({ theme: "healthcare", sector: "Healthcare" }, weights)).toEqual({ status: "new", themeWeightPercent: 0, sectorWeightPercent: 0, sectorOverCap: false });
    expect(rowLens({ theme: "robotics", sector: "Industrials" }, weights)).toMatchObject({ status: "below", sectorOverCap: false });
    expect(rowLens({ theme: "ai-semis", sector: "Technology" }, weights)).toMatchObject({ status: "over", sectorOverCap: true });
    expect(rowLens({ theme: "unknown", sector: "Unknown" }, weights).status).toBe("unknown");
  });
  it("labels a name in an above-25% Other bucket as uncapped, never below the cap, and does not move it", () => {
    counter = 0;
    const heavyOther: ModelPortfolio = { asOf: "2026-11-13", holdings: [holding("BANK", 40, "other", "Financial Services"), holding("NVDA", 60, "ai-semis", "Technology")] };
    const w = modelWeights(heavyOther)!;
    expect(rowLens({ theme: "other", sector: "Financial Services" }, w)).toMatchObject({ status: "uncapped", themeWeightPercent: 40 });
    const lens = applyModelLens(ranked([row("CHIP", "ai-semis"), row("INS", "other", "Financial Services")]), heavyOther)!;
    expect(lens.rows.map((r) => [r.ticker, r.lens?.status])).toEqual([["INS", "uncapped"], ["CHIP", "over"]]);
    expect(widenedThemes(lens.rows)).toEqual([]);
  });

  it("notes a sector group above its cap without changing the theme status", () => {
    expect(rowLens({ theme: "robotics", sector: "Technology" }, weights)).toMatchObject({ status: "below", sectorOverCap: true });
  });
});

describe("applyModelLens", () => {
  it("moves names in an above-cap theme below the others and keeps the shortlist order inside each part", () => {
    counter = 0;
    const kept = ranked([row("CHIP", "ai-semis"), row("BOT", "robotics", "Industrials"), row("SAAS", "cloud-software"), row("BIO", "healthcare", "Healthcare"), row("ODD", "unknown", "Unknown"), row("GPU", "ai-semis")]);
    const lens = applyModelLens(kept, model)!;
    expect(lens.rows.map((r) => r.ticker)).toEqual(["BOT", "BIO", "ODD", "CHIP", "SAAS", "GPU"]);
    expect(lens.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lens.rows.map((r) => r.shortlistRank)).toEqual([2, 4, 5, 1, 3, 6]);
    expect(lens.rows.map((r) => r.placedByLens)).toEqual([false, false, false, true, false, false]);
    expect(lens.rows[0].decidedBy).toBeNull();
    expect(lens.rows[3].decidedBy).toBeNull();
    expect(lens.rows[1].decidedBy).toBe("percent");
    expect(lens.moved).toBe(2);
    expect(lens.overThemes.map((share) => share.key)).toEqual(["cloud-software", "ai-semis"]);
  });

  it("changes nothing when no theme is above the cap", () => {
    counter = 0;
    const kept = ranked([row("A", "ai-semis"), row("B", "healthcare", "Healthcare")]);
    const lens = applyModelLens(kept, { asOf: "2026-11-13", holdings: [holding("X", 20, "ai-semis", "Technology"), holding("Y", 80, "other", "Financial Services")] })!;
    expect(lens.rows.map((r) => r.ticker)).toEqual(["A", "B"]);
    expect(lens.moved).toBe(0);
    expect(lens.overThemes).toEqual([]);
  });

  it("is null without a model portfolio, and the shortlist order stays", () => {
    counter = 0;
    const kept = ranked([row("A", "ai-semis"), row("B", "healthcare")]);
    expect(applyModelLens(kept, null)).toBeNull();
    expect(applyModelLens(kept, { asOf: "2026-11-13", holdings: [] })).toBeNull();
    expect(orderedRows(kept, null).map((r) => r.ticker)).toEqual(["A", "B"]);
  });

  it("lists the themes the shown names widen the model with, in rank order, without other or Unknown", () => {
    counter = 0;
    const kept = ranked([row("BOT", "robotics", "Industrials"), row("BIO", "healthcare", "Healthcare"), row("BIO2", "healthcare", "Healthcare"), row("BANK", "other", "Financial Services"), row("ODD", "unknown", "Unknown"), row("CHIP", "ai-semis")]);
    const lens = applyModelLens(kept, model)!;
    expect(widenedThemes(lens.rows)).toEqual(["robotics", "healthcare"]);
    expect(widenedThemes(kept)).toEqual([]);
  });
});

describe("top N", () => {
  it("reads SHORTLIST_TOP_N within bounds and falls back to 6", () => {
    expect(topNFrom(undefined)).toBe(6);
    expect(topNFrom("8")).toBe(8);
    expect(topNFrom("5")).toBe(5);
    expect(topNFrom("0")).toBe(6);
    expect(topNFrom("16")).toBe(6);
    expect(topNFrom("6.5")).toBe(6);
    expect(topNFrom("lots")).toBe(6);
    expect(topNFrom(" ")).toBe(6);
  });
});
