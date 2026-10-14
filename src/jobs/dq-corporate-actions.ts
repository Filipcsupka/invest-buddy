import pg from "pg";
import { detectFromBars, detectFromRevisions, type CorporateAction } from "../data/corporate-actions";
import { insertCorporateActions, loadRevisedBars } from "../db/corporate-actions";
import { loadInputs, type DqInput } from "./dq";
import { runLoggedJob } from "./job-log";

/** Revisions younger than this many days are read. */
export const REVISION_WINDOW_DAYS = 14;

/** Candidates of one ticker with the same ratio within this many days are one event: the bar path and the revision path date it a day or two apart. */
export const MERGE_WINDOW_DAYS = 3;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Keeps the earliest candidate of each same-ticker, same-ratio group within MERGE_WINDOW_DAYS and lists the rules that agreed. */
export function mergeNearby(actions: CorporateAction[]): CorporateAction[] {
  const sorted = [...actions].sort((a, b) => a.ticker.localeCompare(b.ticker) || a.actionDate.localeCompare(b.actionDate));
  const out: CorporateAction[] = [];
  for (const action of sorted) {
    const kept = out.find((k) => k.ticker === action.ticker && k.ratio === action.ratio && k.kind === action.kind && Math.abs(dayNumber(action.actionDate) - dayNumber(k.actionDate)) <= MERGE_WINDOW_DAYS);
    if (!kept) { out.push(action); continue; }
    const rules = new Set([kept.detail.rule, ...((kept.detail.mergedRules as unknown[] | undefined) ?? []), action.detail.rule].filter(Boolean));
    kept.detail = { ...kept.detail, mergedRules: [...rules] };
  }
  return out;
}

/** Pure: split candidates for every ticker from its bars and its recent revisions. */
export function detectAll(inputs: DqInput[], revised: Map<string, { barDate: string; oldClose: number; newClose: number }[]>): CorporateAction[] {
  return mergeNearby(inputs.flatMap(({ ticker, bars }) => {
    const dates = bars.map((bar) => bar.date).sort();
    const next = (after: string) => dates.find((date) => date > after) ?? null;
    return [...detectFromBars(ticker, bars), ...detectFromRevisions(ticker, revised.get(ticker) ?? [], next)];
  }));
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
