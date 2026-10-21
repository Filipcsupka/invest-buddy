import type { Pool, PoolClient } from "pg";
import type { AiCard } from "@/ai-cards/parse";

type Db = Pick<Pool | PoolClient, "query">;
type Row = Omit<AiCard, "children"> & { id: number; parentId: number | null; importedAt: string };

export async function insertAiCards(db: Db, cards: AiCard[]): Promise<{ inserted: number; duplicate: number }> {
  let inserted = 0;
  let duplicate = 0;
  async function insert(card: AiCard, parentId: number | null) {
    const values = [card.symbol, card.exchangeHint, card.callText, card.call, card.amountText, card.amountMinEur, card.amountMaxEur, card.cardDate, card.tag, card.summary, JSON.stringify(card.sections), JSON.stringify(card.evidenceNames), card.priceText, card.priceValue, card.priceCurrency, parentId, card.rawText, card.dedupeKey];
    const result = await db.query<{ id: number }>(`INSERT INTO ai_cards (symbol,exchange_hint,call_text,call,amount_text,amount_min_eur,amount_max_eur,card_date,tag,summary,sections,evidence_names,price_text,price_value,price_currency,parent_id,raw_text,dedupe_key)
      VALUES (${values.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, values);
    let id = result.rows[0]?.id;
    if (id) inserted++; else {
      duplicate++;
      const existing = await db.query<{ id: number }>("SELECT id FROM ai_cards WHERE dedupe_key=$1", [card.dedupeKey]);
      id = existing.rows[0]?.id;
    }
    if (id) for (const child of card.children) await insert(child, id);
  }
  for (const card of cards) await insert(card, null);
  return { inserted, duplicate };
}

export async function listAiCards(db: Db): Promise<Row[]> {
  const result = await db.query<{
    id: string; symbol: string; exchangeHint: string | null; callText: string; call: AiCard["call"];
    amountText: string | null; amountMinEur: string | null; amountMaxEur: string | null;
    cardDate: string | null; tag: string | null; summary: string; sections: AiCard["sections"];
    evidenceNames: string[]; priceText: string | null; priceValue: string | null; priceCurrency: string | null;
    parentId: string | null; rawText: string; dedupeKey: string; importedAt: string;
  }>(`SELECT id::text,symbol,exchange_hint AS "exchangeHint",call_text AS "callText",call,
      amount_text AS "amountText",amount_min_eur::text AS "amountMinEur",amount_max_eur::text AS "amountMaxEur",
      card_date::text AS "cardDate",tag,summary,sections,evidence_names AS "evidenceNames",
      price_text AS "priceText",price_value::text AS "priceValue",price_currency AS "priceCurrency",
      parent_id::text AS "parentId",raw_text AS "rawText",dedupe_key AS "dedupeKey",imported_at::text AS "importedAt"
    FROM ai_cards ORDER BY card_date DESC NULLS LAST, imported_at DESC, id DESC`);
  return result.rows.map((r) => ({ ...r, id: Number(r.id), parentId: r.parentId ? Number(r.parentId) : null,
    amountMinEur: r.amountMinEur === null ? null : Number(r.amountMinEur), amountMaxEur: r.amountMaxEur === null ? null : Number(r.amountMaxEur),
    priceValue: r.priceValue === null ? null : Number(r.priceValue) }));
}

export type StoredAiCard = Awaited<ReturnType<typeof listAiCards>>[number];
export function latestBySymbol(cards: StoredAiCard[]): StoredAiCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => { if (seen.has(card.symbol)) return false; seen.add(card.symbol); return true; });
}

export async function compareAiCardSymbols(db: Db, symbols: string[]) {
  if (!symbols.length) return {} as Record<string, { score: number | null; state: string | null } | null>;
  const rows = await db.query<{ ticker: string; total: number | null; state: string | null }>(`SELECT m.ticker,s.total,s.state FROM universe_membership m
    LEFT JOIN LATERAL (SELECT total,state FROM score_results WHERE ticker=m.ticker ORDER BY as_of DESC LIMIT 1) s ON true
    WHERE m.ticker = ANY($1::text[]) AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
    AND m.list NOT IN ('benchmark', 'extended')`, [symbols]);
  const result: Record<string, { score: number | null; state: string | null } | null> = Object.fromEntries(symbols.map((s) => [s, null]));
  for (const row of rows.rows) result[row.ticker] = { score: row.total, state: row.state };
  return result;
}
