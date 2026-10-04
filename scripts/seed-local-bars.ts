import pg from "pg";
import { fixtureBars } from "../src/data/fixtures";
const url = process.env.DATABASE_URL;
if (!url || !url.includes("localhost") && !url.includes("127.0.0.1")) throw new Error("Set a localhost DATABASE_URL for this local-only seed");
const asOf = process.env.SCAN_AS_OF ?? new Date().toISOString().slice(0, 10);
const bars = fixtureBars("NVDA");
const end = new Date(`${asOf}T00:00:00Z`).getTime();
const pool = new pg.Pool({ connectionString: url });
async function main() {
try {
  for (const [index, bar] of bars.entries()) {
    const date = new Date(end - (bars.length - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    await pool.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume) VALUES ('NVDA',$1,$2,$3,$4,$5,$6)
      ON CONFLICT (ticker,bar_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume`, [date, bar.open, bar.high, bar.low, bar.close, bar.volume]);
  }
  process.stdout.write(`Seeded ${bars.length} synthetic NVDA bars through ${asOf} for local testing\n`);
} finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
