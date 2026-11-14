import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ShortlistData } from "@/data/shortlist";
import { applyModelLens } from "@/engine/model-lens";
import type { ShortlistRow } from "@/engine/shortlist";
import type { SectorGroup } from "@/universe/sector-groups";
import type { Theme } from "@/universe/themes";
import { rankReason, ShortlistTopPicks, weightText } from "./shortlist-top-picks";

function row(rank: number, ticker: string, theme: Theme, sector: SectorGroup, over: Partial<ShortlistRow> = {}): ShortlistRow {
  return {
    ticker, sector, theme, percent: 95 - rank, evidencedPoints: 25, reportDate: null, checks: [], kept: true, dropReasons: [], notAssessed: [], flags: [],
    rank, decidedBy: rank === 1 ? null : "percent", rsReturnPercent: 10, rsPercentile: 90, tradedValueUsd: 5e6, atrPercent: 2, drawdownPercent: 5, reportSessions: null, ...over,
  };
}
const kept = [
  row(1, "CHIP", "ai-semis", "Technology"), row(2, "BOT", "robotics", "Industrials"), row(3, "BIO", "healthcare", "Healthcare"),
  row(4, "SAAS", "cloud-software", "Technology"), row(5, "FIN", "fintech", "Financial Services"), row(6, "CAR", "energy-ev", "Consumer Cyclical"),
  row(7, "SHOP", "consumer", "Consumer Cyclical"), row(8, "ODD", "unknown", "Unknown"),
];
const base: ShortlistData = {
  shortlist: {
    asOf: "2026-11-13", configVersion: "test", candidates: 10, kept, dropped: [row(0, "LOW", "other", "Basic Materials", { kept: false, rank: null, dropReasons: ["RS_LOW"] }), row(0, "ALSO", "other", "Real Estate", { kept: false, rank: null, dropReasons: ["EVIDENCE_LOW"] })],
    gates: { F1: { pass: 0, fail: 0, notAssessed: 0 }, F2: { pass: 0, fail: 0, notAssessed: 0 }, F3: { pass: 0, fail: 0, notAssessed: 0 } },
    survivors: { afterF1: 9, afterF2: 8, flaggedF3: 0 },
  },
  concentration: { total: 8, thresholdPercent: 30, groups: [], unknownCount: 1 },
  names: { CHIP: "Chip Co" }, sample: false,
};
const model = { asOf: "2026-11-13", holdings: [
  { symbol: "NVDA", weightPercent: 45.4, theme: "ai-semis" as const, sector: "Technology" as const },
  { symbol: "MSFT", weightPercent: 20.2, theme: "cloud-software" as const, sector: "Technology" as const },
  { symbol: "CRWD", weightPercent: 34.4, theme: "cybersecurity" as const, sector: "Technology" as const },
] };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("top picks block", () => {
  it("formats model weights as whole percent for customers and one decimal for the owner", () => {
    expect(weightText("en", 45.4, false)).toBe("45%");
    expect(weightText("en", 45.4, true)).toBe("45.4%");
    expect(weightText("sk", 45.4, true)).toBe("45,4 %");
  });

  it("shows the first N in lens order with a reason per row and the lens line", () => {
    const data = { ...base, lens: applyModelLens(kept, model), exactWeights: false };
    const html = renderToStaticMarkup(<ShortlistTopPicks locale="en" data={data} limit={6} variant="dashboard" />);
    const plain = text(html);
    expect([...html.matchAll(/data-ticker="([A-Z]+)"/g)].map((m) => m[1]).slice(0, 6)).toEqual(["BOT", "BIO", "SAAS", "FIN", "CAR", "SHOP"]);
    expect(plain).toContain("The first 6 of 8 shortlist names.");
    expect(plain).toContain("Model portfolio: 45% AI and semiconductors and 34% Cybersecurity.");
    expect(plain).toMatch(/The names here widen it with Robotics and automation, Healthcare and biotech, Cloud and software, Fintech, Energy and EV,? and Consumer\./);
    expect(plain).toContain("Sector group Technology: 100% of the model portfolio, above 30%");
    expect(plain).toContain("Robotics and automation: not in the model portfolio");
    expect(plain).toContain("Cloud and software: 20% of the model portfolio, cap 25%");
    expect(plain).toContain("Weights are rounded to whole percent");
    expect(plain).toContain("Full shortlist (8)");
    expect(plain).toMatch(/All .+ names \(10\)/);
    expect(plain).not.toMatch(/\b(buy|sell|hold|you should|recommend\w*)\b/i);
    expect(plain).not.toMatch(/EUR|€/);
  });

  it("explains the order: first row, a tie-breaker, and a row placed by the lens", () => {
    const lens = applyModelLens(kept, model)!;
    expect(rankReason("en", lens.rows[0])).toBe("Highest ranked by the rules");
    expect(rankReason("en", lens.rows[1])).toMatch(/^Order decided by: Score percent · 92/);
    const chip = lens.rows.find((r) => r.ticker === "CHIP")!;
    expect(chip.placedByLens).toBe(true);
    expect(rankReason("en", chip)).toBe("Placed after the names above: its theme is above the 25% cap in the model portfolio");
  });

  it("keeps the shortlist order and says so when no portfolio snapshot is stored", () => {
    const html = renderToStaticMarkup(<ShortlistTopPicks locale="sk" data={{ ...base, lens: null }} limit={5} variant="dashboard" />);
    expect([...html.matchAll(/data-ticker="([A-Z]+)"/g)].map((m) => m[1]).slice(0, 5)).toEqual(["CHIP", "BOT", "BIO", "SAAS", "FIN"]);
    expect(text(html)).toContain("Snímka modelového portfólia nie je uložená");
    expect(html).toContain('data-lens-summary="off"');
  });

  it("shows exact weights to the owner", () => {
    const html = renderToStaticMarkup(<ShortlistTopPicks locale="en" data={{ ...base, lens: applyModelLens(kept, model), exactWeights: true }} limit={6} variant="dashboard" />);
    expect(text(html)).toContain("Model portfolio: 45.4% AI and semiconductors and 34.4% Cybersecurity.");
    expect(text(html)).toContain("From the stored IBKR snapshot of");
  });
});
