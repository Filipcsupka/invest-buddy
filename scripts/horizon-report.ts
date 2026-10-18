import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { companyFlags } from "../src/engine/flags";
import { HORIZON_RULES, horizonProfile, type HorizonResult, type QuarterRevenue } from "../src/engine/horizon";
import { REVENUE_CONCEPTS } from "../src/collectors/sources/frames";
import type { OHLCV } from "../src/engine/types";

/** TASK-099: report only. Labels every stored instrument with its horizon profile and writes labels.csv and review.md. Reads the database, writes nothing back. */
type Q = Pick<pg.Pool, "query">;
export interface Row { ticker: string; name: string; tier: number | null; result: HorizonResult }

export async function buildRows(db: Q, asOf: string): Promise<Row[]> {
  const inst = await db.query<{ ticker: string; name: string; tier: number | null }>("SELECT ticker,name,tier FROM instruments WHERE source<>'benchmark' ORDER BY ticker");
  const barsRes = await db.query<{ ticker: string; bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
    "SELECT ticker,bar_date::text,open,high,low,close,volume FROM daily_bars WHERE bar_date<=$1::date AND bar_date>$1::date-200 ORDER BY ticker,bar_date", [asOf]);
  const bars = new Map<string, OHLCV[]>();
  for (const b of barsRes.rows) (bars.get(b.ticker) ?? bars.set(b.ticker, []).get(b.ticker)!).push({ date: b.bar_date, open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: +b.volume });
  const rev = await db.query<{ ticker: string; concept: string; period_end: string; value: string }>(
    `SELECT DISTINCT ON (ticker,concept,period_end) ticker,concept,period_end::text,value::text FROM fundamentals_pit
     WHERE taxonomy='us-gaap' AND unit='USD' AND concept=ANY($1) AND filed<=$2::date AND period_start IS NOT NULL AND period_end-period_start BETWEEN 80 AND 100
     ORDER BY ticker,concept,period_end,filed DESC`, [[...REVENUE_CONCEPTS], asOf]);
  const revBy = mergeRevenueConcepts(rev.rows);
  const sh = await db.query<{ ticker: string; period_end: string; value: string }>(
    `SELECT DISTINCT ON (ticker,period_end) ticker,period_end::text,value::text FROM fundamentals_pit
     WHERE concept IN ('EntityCommonStockSharesOutstanding','CommonStockSharesOutstanding') AND filed<=$1::date
     ORDER BY ticker,period_end,CASE WHEN concept='EntityCommonStockSharesOutstanding' THEN 0 ELSE 1 END,filed DESC`, [asOf]);
  const shares = new Map<string, { periodEnd: string; value: number }[]>();
  for (const s of sh.rows) (shares.get(s.ticker) ?? shares.set(s.ticker, []).get(s.ticker)!).push({ periodEnd: s.period_end, value: +s.value });
  return inst.rows.map((i) => {
    const b = bars.get(i.ticker) ?? [];
    const revenue = revBy.get(i.ticker) ?? [];
    const counts = shares.get(i.ticker) ?? [];
    const latestShares = [...counts].sort((x, y) => y.periodEnd.localeCompare(x.periodEnd))[0]?.value;
    const last = b[b.length - 1];
    // Interest cover and short interest need their own loaders; the report leaves them as no data.
    const flags = companyFlags({ bars: b, shares: counts, operatingIncome: null, interestExpense: null, shortInterestPercent: null });
    return { ticker: i.ticker, name: i.name, tier: i.tier, result: horizonProfile({ bars: b, revenue, marketCapUsd: last && latestShares ? last.close * latestShares : null, flags, tier: i.tier }) };
  });
}

/** A filer may change its revenue tag. Keep one value per quarter, preferring the SEC tag order. */
export function mergeRevenueConcepts(rows: readonly { ticker: string; concept: string; period_end: string; value: string }[]): Map<string, QuarterRevenue[]> {
  const byTicker = new Map<string, Map<string, QuarterRevenue>>();
  for (const concept of REVENUE_CONCEPTS) for (const row of rows) {
    if (row.concept !== concept) continue;
    const quarters = byTicker.get(row.ticker) ?? byTicker.set(row.ticker, new Map()).get(row.ticker)!;
    if (!quarters.has(row.period_end)) quarters.set(row.period_end, { periodEnd: row.period_end, value: +row.value });
  }
  return new Map([...byTicker].map(([ticker, quarters]) => [ticker, [...quarters.values()]]));
}

export function labelsCsv(rows: Row[]): string {
  const head = "ticker,name,profile,reasons,yoy_latest,yoy_oldest,market_cap_usd,dollar_volume,atr_percent,move_5d,volume_ratio,tier";
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return [head, ...rows.map(({ ticker, name, tier, result: r }) => [ticker, q(name), r.profile, q(r.reasons.join(" ")), v(r.values.yoyLatest), v(r.values.yoyOldest), v(r.values.marketCapUsd), v(r.values.dollarVolume), v(r.values.atrPercent), v(r.values.move5), v(r.values.volumeRatio), v(tier)].join(","))].join("\n") + "\n";
}

export function reviewMarkdown(rows: Row[], asOf: string): string {
  const by = (p: string) => rows.filter((r) => r.result.profile === p).map((r) => r.ticker);
  const line = (title: string, list: string[]) => `- ${title} (${list.length}): ${list.join(", ") || "none"}`;
  return `# Horizon report (rules ${HORIZON_RULES.version}), data as of ${asOf}\n\nReport only. Nothing was written to the database. Thresholds are placeholders for owner review. Interest cover and short interest are not loaded here, so those flags read no data.\n\n${line("Sustained growth", by("sustained"))}\n${line("Event-driven", by("event"))}\n${line("Mixed", by("mixed"))}\n${line("No data", by("no-data"))}\n`;
}

if (/(?:^|[/\\])horizon-report\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const asOf = arg("--as-of", new Date().toISOString().slice(0, 10)), out = arg("--out", "tmp/horizon");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Usage: horizon-report [--as-of YYYY-MM-DD] [--out DIR] (DATABASE_URL required)");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  buildRows(pool, asOf).then((rows) => {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "labels.csv"), labelsCsv(rows));
    writeFileSync(join(out, "review.md"), reviewMarkdown(rows, asOf));
    process.stdout.write(`${rows.length} instruments labelled, wrote ${out} (report only)\n`);
  }).catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
}
