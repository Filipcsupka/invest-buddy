import pg from "pg";
import { EodhdClient, type ExchangeSymbol } from "../data-providers/eodhd/client";
import { runLoggedJob } from "./job-log";

// UNVERIFIED: PA, AS, SW, PR, MI, MC, ST, OL, CO, HE, VI, BR and LS may not be EODHD exchange codes.
// exchanges-list is checked on each run; absent codes are logged and skipped.
export const EXCHANGES = ["US", "XETRA", "LSE", "PA", "AS", "SW", "PR", "WAR", "MI", "MC", "ST", "OL", "CO", "HE", "VI", "BR", "LS"] as const;

type Query = Pick<pg.PoolClient, "query">;
type Client = Pick<EodhdClient, "exchangesList" | "exchangeSymbolList" | "getCallCosts">;

function validRows(rows: ExchangeSymbol[], exchange: string): ExchangeSymbol[] {
  if (!Array.isArray(rows) || !rows.length) throw new Error(`EODHD ${exchange}: empty or invalid symbol list; existing rows were not changed`);
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row || typeof row.Code !== "string" || !row.Code.trim() || typeof row.Name !== "string" || !row.Name.trim()) throw new Error(`EODHD ${exchange}: invalid symbol row`);
    // An exchange list is treated as authoritative only when every row can be processed.
    if (seen.has(row.Code)) throw new Error(`EODHD ${exchange}: duplicate code ${row.Code}`);
    seen.add(row.Code);
    return true;
  });
}

/** One transaction per exchange: only a complete, nonempty response can change delisted flags. */
export async function syncExchange(db: Query, exchange: string, rows: ExchangeSymbol[], today: string): Promise<number> {
  const listings = validRows(rows, exchange);
  await db.query("BEGIN");
  try {
    for (let start = 0; start < listings.length; start += 500) {
      const chunk = listings.slice(start, start + 500);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, index) => {
        const offset = index * 10;
        values.push(`${row.Code}.${exchange}`, row.Code, exchange, row.Name, row.Isin || null, row.Currency || null, row.Type || null, row.Country || null, today, today);
        return `(${Array.from({ length: 10 }, (_, n) => `$${offset + n + 1}`).join(",")})`;
      });
      await db.query(`INSERT INTO symbols (vendor_symbol, code, exchange, name, isin, currency, type, country, first_seen, last_seen)
        VALUES ${placeholders.join(",")}
        ON CONFLICT (vendor_symbol) DO UPDATE SET name=EXCLUDED.name, isin=EXCLUDED.isin, currency=EXCLUDED.currency,
          type=EXCLUDED.type, country=EXCLUDED.country, last_seen=EXCLUDED.last_seen, delisted=false`, values);
    }
    await db.query("UPDATE symbols SET delisted=true WHERE exchange=$1 AND NOT (code = ANY($2::text[])) AND delisted=false", [exchange, listings.map((row) => row.Code)]);
    await db.query("COMMIT");
    return listings.length;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function syncSymbols(db: pg.Pool, eodhd: Client, today: string) {
  const available = new Set((await eodhd.exchangesList()).map((row) => row.Code));
  let exchanges = 0;
  let symbols = 0;
  const skipped: string[] = [];
  for (const exchange of EXCHANGES) {
    if (!available.has(exchange)) {
      skipped.push(exchange);
      process.stdout.write(`symbols-sync: ${exchange} absent from exchanges-list; skipped\n`);
      continue;
    }
    const rows = await eodhd.exchangeSymbolList(exchange);
    const connection = await db.connect();
    try { symbols += await syncExchange(connection, exchange, rows, today); }
    finally { connection.release(); }
    exchanges++;
  }
  return { exchanges, symbols, skipped: skipped.join(","), skippedCount: skipped.length, calls: Object.values(eodhd.getCallCosts()).reduce((a, b) => a + b, 0) };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const eodhd = new EodhdClient();
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return await syncSymbols(db, eodhd, new Date().toISOString().slice(0, 10)); }
  finally { await db.end(); }
}

if (/(?:^|[/\\])symbols-sync\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("symbols-sync", main);
