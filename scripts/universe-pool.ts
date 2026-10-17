import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeGrowth, fetchFrame, label, latestQuarter, REVENUE_CONCEPTS, shift, type FrameValue } from "../src/collectors/sources/frames";
import { poolCsv, rankPool } from "../src/universe/pool";
import { defaultHttp } from "../src/collectors/sources/client";
import { loadTickers } from "../src/collectors/sources/sec";

/** D35 step 1: market-wide revenue growth screen from SEC frames. Sustained growth only: latest and prior quarter YoY must both clear the floor, ranked by the weaker of the two so one-off spikes do not lead. Reads SEC only; writes a ranked pool CSV and JSON, no database write. */
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
    process.stdout.write(`${label(quarter)}: ${growth.length} filers with growth, ${rows.length} in pool (revenue >= 50M, YoY >= ${minYoy}%); wrote ${out}/pool.csv\n`);
  };
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
