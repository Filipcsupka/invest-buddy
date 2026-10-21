import { readFileSync } from "node:fs";
import pg from "pg";
import { parseAiCards } from "../src/ai-cards/parse";
import { insertAiCards } from "../src/db/ai-cards";

export async function importAiCardsFile(path: string, dryRun: boolean, dbUrl = process.env.DATABASE_URL) {
  const cards = parseAiCards(readFileSync(path, "utf8"));
  const all = cards.flatMap((c) => [c, ...c.children]);
  console.table(all.map((c) => ({ symbol: c.symbol, date: c.cardDate, call: c.call, amount: c.amountText, child: cards.includes(c) ? "" : "yes" })));
  if (dryRun) return { parsed: all.length, inserted: 0, duplicate: 0 };
  if (!dbUrl) throw new Error("DATABASE_URL is required unless --dry-run is used");
  const db = new pg.Pool({ connectionString: dbUrl });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await insertAiCards(client, cards);
    await client.query("COMMIT");
    return { parsed: all.length, ...result };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); await db.end(); }
}

if (process.argv[1]?.endsWith("ai-cards-import.ts")) {
  const path = process.argv[2];
  if (!path) { console.error("Usage: ai-cards:import -- file.txt [--dry-run]"); process.exitCode = 2; }
  else importAiCardsFile(path, process.argv.includes("--dry-run")).then(console.log).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
