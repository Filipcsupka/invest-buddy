import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeGrowth, fetchFrame, label, latestQuarter, MIN_REVENUE, REVENUE_CONCEPTS, shift, type FrameValue, type Growth } from "../src/collectors/sources/frames";
import { defaultHttp } from "../src/collectors/sources/client";
import { loadTickers } from "../src/collectors/sources/sec";

/** D35 step 1: market-wide revenue growth screen from SEC frames. Sustained growth only: latest and prior quarter YoY must both clear the floor, ranked by the weaker of the two so one-off spikes do not lead. Reads SEC only; writes a ranked pool CSV and JSON, no database write. */
export interface PoolRow extends Growth { ticker: string; rank: number }

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

if (/(?:^|[/\\])universe-pool\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
  const out = arg("--out", "tmp/universe"), size = Number(arg("--size", "300")), minYoy = Number(arg("--min-yoy", "15"));
  const held = new Set(arg("--held", "").split(",").filter(Boolean));
  const run = async () => {
    const http = defaultHttp(), quarter = latestQuarter(new Date());
    const labels = [quarter, shift(quarter, -1), shift(quarter, -4), shift(quarter, -5)];
    const byConcept = new Map<string, Map<string, Map<number, FrameValue>>>();
    for (const concept of REVENUE_CONCEPTS) {
      const frames = new Map<string, Map<number, FrameValue>>();
      for (const wanted of labels) frames.set(label(wanted), await fetchFrame({ http } as never, concept, wanted));
      byConcept.set(concept, frames);
    }
    const tickers = await loadTickers(http);
    const tickerByCik = new Map([...tickers.byCik].map(([cik, row]) => [cik, row.ticker]));
    const growth = computeGrowth(byConcept, quarter);
    const rows = rankPool(growth, tickerByCik, held, { minYoy, size });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "pool.csv"), poolCsv(rows));
    writeFileSync(join(out, "pool.json"), JSON.stringify(rows, null, 1));
    process.stdout.write(`${label(quarter)}: ${growth.length} filers with growth, ${rows.length} in pool (revenue >= ${MIN_REVENUE / 1e6}M, YoY >= ${minYoy}%); wrote ${out}/pool.csv\n`);
  };
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
