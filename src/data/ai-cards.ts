import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAiCards } from "@/ai-cards/parse";
import { compareAiCardSymbols, listAiCards, type StoredAiCard } from "@/db/ai-cards";
import { getPool } from "@/db/pool";
import { scoredUniverse } from "./scored";

export async function aiCardsData(): Promise<{ cards: StoredAiCard[]; comparison: Record<string, { score: number | null; state: string | null } | null>; sample: boolean }> {
  if (process.env.DATA_MODE === "fixture") {
    const raw = readFileSync(join(process.cwd(), "src/ai-cards/__fixtures__/sample.txt"), "utf8");
    const parsed = parseAiCards(raw);
    const cards: StoredAiCard[] = parsed.flatMap((card, i) => [
      { ...card, id: i + 1, parentId: null, importedAt: card.cardDate ?? "", children: undefined },
      ...card.children.map((child, j) => ({ ...child, id: 100 + i * 10 + j, parentId: i + 1, importedAt: card.cardDate ?? "", children: undefined })),
    ]).sort((a, b) => (b.cardDate ?? "").localeCompare(a.cardDate ?? "") || b.id - a.id);
    const scores = await scoredUniverse();
    const scored = new Map(scores.map(({ instrument, result }) => [instrument.ticker, { score: result.total, state: result.state }]));
    return { cards, comparison: Object.fromEntries(cards.map((c) => [c.symbol, scored.get(c.symbol) ?? null])), sample: true };
  }
  const db = getPool();
  if (!db) return { cards: [], comparison: {}, sample: false };
  const cards = await listAiCards(db);
  const comparison = await compareAiCardSymbols(db, [...new Set(cards.map((c) => c.symbol))]);
  return { cards, comparison, sample: false };
}
