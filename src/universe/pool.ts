import { MIN_REVENUE, type Growth } from "../collectors/sources/frames";

/** Market-wide growth pool: ranking and CSV for the D35 candidate list. */
export interface PoolRow extends Growth { ticker: string; rank: number }

/** Pool symbols Twelve Data answers with "not found" (checked 2026-10-18). Pool-bars does not ask for them again. */
export const NOT_FOUND_SYMBOLS: ReadonlySet<string> = new Set(["PHXE-P", "HGIT", "ZARE"]);

export function rankPool(growth: Growth[], tickerByCik: Map<number, string>, held: ReadonlySet<string>, opts: { minYoy: number; minPriorYoy?: number; size: number }): PoolRow[] {
  return growth
    .filter((row) => row.revenue >= MIN_REVENUE && row.yoyPercent >= opts.minYoy && row.priorYoyPercent >= (opts.minPriorYoy ?? 10) && tickerByCik.has(row.cik) && !held.has(tickerByCik.get(row.cik)!))
    .sort((a, b) => Math.min(b.yoyPercent, b.priorYoyPercent) - Math.min(a.yoyPercent, a.priorYoyPercent) || b.revenue - a.revenue)
    .slice(0, opts.size)
    .map((row, index) => ({ ...row, ticker: tickerByCik.get(row.cik)!, rank: index + 1 }));
}

export function poolCsv(rows: PoolRow[]): string {
  const head = "rank,ticker,name,cik,revenue,yoy_percent,prior_yoy_percent,acceleration_pp,qoq_percent,quarter_end";
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [head, ...rows.map((r) => [r.rank, r.ticker, esc(r.name), r.cik, r.revenue, r.yoyPercent, r.priorYoyPercent, r.accelerationPp, r.qoqPercent, r.end].join(","))].join("\n") + "\n";
}
