// Read-only. Writes a golden fixture for score and signals: one scoring date, every instrument, data only.
// Usage:
//   DATABASE_URL=... npx tsx scripts/export-golden.ts 2026-10-08            (one SELECT-only read through buildJudgeInput)
//   npx tsx scripts/export-golden.ts 2026-10-08 --from-json judge-input.json (a saved GET /api/ingest/judge-input?maxSymbols=40&symbols=... response)
// Output: src/engine/fixtures/golden-<date>.json. Holdings, EUR amounts, cost basis and evidence links are dropped.
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { buildJudgeInput } from "../src/db/judge-input";
import { buildGolden } from "../src/engine/golden";

async function main() {
  const [asOf, flag, file] = process.argv.slice(2);
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("usage: export-golden.ts YYYY-MM-DD [--from-json FILE]");
  let symbols;
  if (flag === "--from-json") {
    if (!file) throw new Error("--from-json needs a file");
    symbols = (JSON.parse(readFileSync(file, "utf8")) as { symbols: Parameters<typeof buildGolden>[0] }).symbols;
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const tickers = (await pool.query<{ ticker: string }>("SELECT ticker FROM instruments ORDER BY ticker")).rows.map((r) => r.ticker);
      symbols = (await buildJudgeInput(pool, asOf, new Date(), Math.max(tickers.length, 1), tickers)).symbols;
    } finally { await pool.end(); }
  }
  const out = `src/engine/fixtures/golden-${asOf}.json`;
  writeFileSync(out, JSON.stringify(buildGolden(symbols, asOf, `Current main behaviour on ${asOf}, ${symbols.length} tickers. Inputs and expected signal, no holdings or amounts.`), null, 1) + "\n");
  console.error(`wrote ${out} with ${symbols.length} tickers`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
