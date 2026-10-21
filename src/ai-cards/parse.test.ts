import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAiCards } from "./parse";

const sample = readFileSync(join(process.cwd(), "src/ai-cards/__fixtures__/sample.txt"), "utf8");
describe("AI card parser", () => {
  it("keeps every character of the sample and its children", () => {
    const cards = parseAiCards(sample);
    expect(cards.map((c) => c.rawText).join("")).toBe(sample);
    expect(cards.map((c) => c.symbol)).toEqual(["VLX", "ABBN", "NFLX"]);
    expect(cards[2].children.map((c) => c.symbol)).toEqual(["SPCX", "SMCI"]);
    expect(cards[0].amountMinEur).toBe(40);
    expect(cards[0].amountMaxEur).toBe(60);
    expect(cards[0].priceValue).toBe(563);
    expect(cards[0].priceCurrency).toBe("GBX");
    expect(cards[1].priceCurrency).toBe("CHF");
    expect(cards[2].sections.numbers).toContainEqual({ label: "Q3 revenue", value: "$12.87B" });
    expect(cards[2].evidenceNames).toHaveLength(4);
  });
  it("accepts CRLF and missing sections", () => {
    const raw = "ABC — WATCH €0\r\n1 January 2026 | Review\r\nShort summary.\r\nUnknown heading\r\nA stray detail\r\n";
    const cards = parseAiCards(raw);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawText).toBe(raw);
    expect(cards[0].cardDate).toBe("2026-01-01");
    expect(cards[0].amountMinEur).toBe(0);
    expect(cards[0].sections.extra["Unknown heading"]).toEqual(["A stray detail"]);
    const nested = "ABC — HOLD — €0\r\n1 January 2026\r\nOther material portfolio developments\r\nXYZ — WATCH €0\r\nChild note\r\nEvidence\r\nSource\r\n";
    expect(parseAiCards(nested)[0].children[0].rawText).toBe("XYZ — WATCH €0\r\nChild note\r\n");
  });
  it("retains duplicate pastes but gives identical cards the same dedupe key", () => {
    const card = "ABC — START — €40–60\n1 January 2026\nSummary.\n";
    const cards = parseAiCards(card + card);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.rawText).join("")).toBe(card + card);
    expect(cards[0].dedupeKey).toBe(cards[1].dedupeKey);
  });
});
