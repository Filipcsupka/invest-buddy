import type pg from "pg";
import { z } from "zod";
import { isoDate } from "./iso-date";

/**
 * What the judge needs from the portfolio: positions and cash, in EUR. A person fills it by hand today
 * (POST /api/ingest/portfolio-baseline). An interactive IBKR MCP session can write the same shape later.
 * This is personal data. It is read only by the bearer-protected judge input and never shown on a public page.
 */
export const baselineSchema = z.object({
  asOf: isoDate(),
  source: z.enum(["manual", "ibkr-mcp"]),
  currency: z.literal("EUR").default("EUR"),
  cashEur: z.number().nonnegative().max(1e9),
  monthlyContributionEur: z.number().nonnegative().max(1e7).nullable().optional(),
  positions: z.array(z.object({
    symbol: z.string().regex(/^[A-Z0-9.]{1,10}$/),
    quantity: z.number().nonnegative().optional(),
    valueEur: z.number().nonnegative().max(1e9),
    costEur: z.number().nonnegative().max(1e9).optional(),
  }).strict()).max(100),
}).strict();
export type Baseline = z.infer<typeof baselineSchema>;

/** Newest baseline on or before the date, or null when none was entered. */
export async function latestBaseline(pool: Pick<pg.Pool, "query">, asOf: string): Promise<Baseline | null> {
  const r = await pool.query<{ as_of: string; source: Baseline["source"]; cash_eur: string; monthly_contribution_eur: string | null; positions: Baseline["positions"] }>(
    "SELECT as_of::text, source, cash_eur, monthly_contribution_eur, positions FROM portfolio_baseline WHERE as_of <= $1 ORDER BY as_of DESC LIMIT 1", [asOf]);
  const row = r.rows[0];
  if (!row) return null;
  return { asOf: row.as_of, source: row.source, currency: "EUR", cashEur: Number(row.cash_eur), monthlyContributionEur: row.monthly_contribution_eur == null ? null : Number(row.monthly_contribution_eur), positions: row.positions };
}

export async function saveBaseline(pool: Pick<pg.Pool, "query">, b: Baseline): Promise<void> {
  await pool.query(`INSERT INTO portfolio_baseline (as_of, source, currency, cash_eur, monthly_contribution_eur, positions) VALUES ($1,$2,'EUR',$3,$4,$5::jsonb)
    ON CONFLICT (as_of) DO UPDATE SET source=EXCLUDED.source, cash_eur=EXCLUDED.cash_eur, monthly_contribution_eur=EXCLUDED.monthly_contribution_eur, positions=EXCLUDED.positions`,
  [b.asOf, b.source, b.cashEur, b.monthlyContributionEur ?? null, JSON.stringify(b.positions)]);
}
