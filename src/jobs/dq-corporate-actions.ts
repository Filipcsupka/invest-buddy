import pg from "pg";
import { detectFromBars, detectFromRevisions, type CorporateAction } from "../data/corporate-actions";
import { insertCorporateActions, loadRevisedBars } from "../db/corporate-actions";
import { loadInputs, type DqInput } from "./dq";
import { runLoggedJob } from "./job-log";

/** Revisions younger than this many days are read. */
export const REVISION_WINDOW_DAYS = 14;

/** Pure: split candidates for every ticker from its bars and its recent revisions. */
export function detectAll(inputs: DqInput[], revised: Map<string, { barDate: string; oldClose: number; newClose: number }[]>): CorporateAction[] {
  return inputs.flatMap(({ ticker, bars }) => {
    const dates = bars.map((bar) => bar.date).sort();
    const next = (after: string) => dates.find((date) => date > after) ?? null;
    return [...detectFromBars(ticker, bars), ...detectFromRevisions(ticker, revised.get(ticker) ?? [], next)];
  });
}

export async function runCorporateActionDetection(db: Pick<pg.Pool, "query">, today: string) {
  const found = detectAll(await loadInputs(db, today), await loadRevisedBars(db, REVISION_WINDOW_DAYS));
  const written = await insertCorporateActions(db, found);
  return { found: found.length, written };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await runCorporateActionDetection(pool, new Date().toISOString().slice(0, 10));
    process.stdout.write(`Corporate actions: ${result.found} detected, ${result.written} new\n`);
    return { found: result.found, written: result.written, failures: 0 };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])dq-corporate-actions\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("dq-corporate-actions", main);
