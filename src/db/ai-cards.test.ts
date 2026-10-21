import { describe, expect, it } from "vitest";
import { parseAiCards } from "@/ai-cards/parse";
import { compareAiCardSymbols, insertAiCards, latestBySymbol } from "./ai-cards";

describe("AI card storage", () => {
  it("inserts once and then recognizes the same card", async () => {
    const seen = new Map<string, number>();
    const db = { query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO ai_cards")) {
        const key = String(values?.at(-1));
        if (seen.has(key)) return { rows: [] };
        seen.set(key, seen.size + 1); return { rows: [{ id: seen.size }] };
      }
      return { rows: [{ id: seen.get(String(values?.[0])) }] };
    } };
    const cards = parseAiCards("ABC — START — €40–60\n1 January 2026\nSummary.\n");
    expect(await insertAiCards(db as never, cards)).toEqual({ inserted: 1, duplicate: 0 });
    expect(await insertAiCards(db as never, cards)).toEqual({ inserted: 0, duplicate: 1 });
  });
  it("uses the latest record and exact ticker comparison", async () => {
    const cards = [{ symbol: "ABC", call: "REDUCE" }, { symbol: "ABC", call: "START" }, { symbol: "ABCD", call: "WATCH" }] as never;
    expect(latestBySymbol(cards).map((c) => c.call)).toEqual(["REDUCE", "WATCH"]);
    const db = { query: async (sql: string, values: unknown[]) => {
      expect(sql).toContain("m.ticker = ANY($1::text[])");
      expect(values).toEqual([["ABC", "ABCD"]]);
      return { rows: [{ ticker: "ABC", total: 19, state: "Setup met" }] };
    } };
    expect(await compareAiCardSymbols(db as never, ["ABC", "ABCD"])).toEqual({ ABC: { score: 19, state: "Setup met" }, ABCD: null });
  });
});
