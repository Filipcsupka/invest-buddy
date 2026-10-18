import type pg from "pg";
import { z } from "zod";
import { isoDate } from "./iso-date";
import type { EurTrade } from "@/portfolio/eur";

/**
 * Private portfolio baseline: positions and cash, in EUR. A person fills it by hand today
 * (POST /api/ingest/portfolio-baseline). An interactive IBKR MCP session can write the same shape later.
 * This is personal data. The bearer-protected judge input may use holdings for candidate selection;
 * owner allocation reads it separately. It is never shown on a public page.
 */
export const baselineSchema = z.object({
  asOf: isoDate(),
  source: z.enum(["manual", "ibkr-mcp", "flex"]),
  currency: z.literal("EUR").default("EUR"),
  cashEur: z.number().nonnegative().max(1e9),
  monthlyContributionEur: z.number().nonnegative().max(1e7).nullable().optional(),
  positions: z.array(z.object({
    symbol: z.string().regex(/^[A-Z0-9.]{1,10}$/),
    quantity: z.number().nonnegative().optional(),
    valueEur: z.number().nonnegative().max(1e9),
    costEur: z.number().nonnegative().max(1e9).optional(),
  }).strict()).max(100),
  trades: z.array(z.object({ date: isoDate(), symbol: z.string().regex(/^[A-Z0-9.]{1,10}$/), quantity: z.number().finite().refine((n) => n !== 0), proceedsEur: z.number().finite(), feesEur: z.number().nonnegative().finite() }).strict()).max(10000).optional(),
  tradeFromDate: isoDate().nullable().optional(),
}).strict();
export type Baseline = z.infer<typeof baselineSchema>;

/** Newest baseline on or before the date, or null when none was entered. */
export async function latestBaseline(pool: Pick<pg.Pool, "query">, asOf: string): Promise<Baseline | null> {
  const r = await pool.query<{ as_of: string; source: Baseline["source"]; cash_eur: string; monthly_contribution_eur: string | null; positions: Baseline["positions"]; trades: EurTrade[]; trade_from_date: string | null }>(
    "SELECT as_of::text, source, cash_eur, monthly_contribution_eur, positions, trades, trade_from_date::text FROM portfolio_baseline WHERE as_of <= $1 ORDER BY as_of DESC LIMIT 1", [asOf]);
  const row = r.rows[0];
  if (!row) return null;
  return { asOf: row.as_of, source: row.source, currency: "EUR", cashEur: Number(row.cash_eur), monthlyContributionEur: row.monthly_contribution_eur == null ? null : Number(row.monthly_contribution_eur), positions: row.positions, trades: row.trades ?? [], tradeFromDate: row.trade_from_date };
}

export async function saveBaseline(pool: Pick<pg.Pool, "query">, b: Baseline): Promise<void> {
  await pool.query(`INSERT INTO portfolio_baseline (as_of, source, currency, cash_eur, monthly_contribution_eur, positions, trades, trade_from_date) VALUES ($1,$2,'EUR',$3,$4,$5::jsonb,$6::jsonb,$8::date)
    ON CONFLICT (as_of) DO UPDATE SET source=EXCLUDED.source, cash_eur=EXCLUDED.cash_eur, monthly_contribution_eur=EXCLUDED.monthly_contribution_eur, positions=EXCLUDED.positions,
      trades=CASE WHEN $7::boolean THEN EXCLUDED.trades ELSE portfolio_baseline.trades END,
      trade_from_date=CASE WHEN $7::boolean THEN EXCLUDED.trade_from_date ELSE portfolio_baseline.trade_from_date END`,
  [b.asOf, b.source, b.cashEur, b.monthlyContributionEur ?? null, JSON.stringify(b.positions), JSON.stringify(b.trades ?? []), b.trades !== undefined, b.tradeFromDate ?? null]);
}
