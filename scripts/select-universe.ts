import pg from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergePool, type PoolRowWithForms } from "../src/universe/forms";
import { CRITERIA_VERSION, excludedCsv, reviewMarkdown, selectedCsv, selectUniverse, sha256, UNIVERSE_CRITERIA, type Candidate, type Selection } from "../src/universe/select";
import { loadCandidates } from "../src/universe/candidates";
import { changeUniverse } from "./universe-change";
export { loadCandidates } from "../src/universe/candidates";

/** D35 selection: ranks universe candidates and writes CSV and review files. Without --apply it reads only; --apply adds the proposed names to `extended`. */
export type SelectArgs = { asOf: string; out: string; target: number; input?: string; secTickers?: string; pool?: string; dryRun: boolean;
  apply?: { actor: string; reason: string; maxAdds: number; date: string } };
export function parseArgs(args: string[]): SelectArgs {
  const dryRun = args.includes("--dry-run"), apply = args.includes("--apply");
  args = args.filter((arg) => arg !== "--dry-run" && arg !== "--apply");
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || args[i + 1] === undefined || flags.has(args[i])) throw new Error("Invalid select-universe arguments");
    flags.set(args[i], args[i + 1]);
  }
  const allowed = new Set(["--as-of", "--out", "--target", "--input", "--sec-tickers", "--pool", "--actor", "--reason", "--max-adds", "--date"]);
  if ([...flags.keys()].some((k) => !allowed.has(k))) throw new Error("Unknown select-universe option");
  const asOf = flags.get("--as-of");
  const target = Number(flags.get("--target") ?? UNIVERSE_CRITERIA.target);
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isInteger(target) || target < 36 || target > 5000) {
    throw new Error("Usage: select-universe --as-of YYYY-MM-DD [--target 36..5000] [--out DIR] [--input candidates.json | DATABASE_URL] [--sec-tickers company_tickers.json] [--pool pool.json] [--apply --actor NAME --reason TEXT --max-adds N [--date YYYY-MM-DD]]");
  }
  const applyFlags = ["--actor", "--reason", "--max-adds", "--date"].filter((k) => flags.has(k));
  if (!apply && applyFlags.length) throw new Error(`${applyFlags.join(", ")} needs --apply`);
  if (apply && dryRun) throw new Error("--apply and --dry-run exclude each other");
  const base = { asOf, out: flags.get("--out") ?? "tmp/universe", target, input: flags.get("--input"), secTickers: flags.get("--sec-tickers"), pool: flags.get("--pool"), dryRun: !apply };
  if (!apply) return base;
  const actor = flags.get("--actor")?.trim(), reason = flags.get("--reason")?.trim(), maxAdds = Number(flags.get("--max-adds")), date = flags.get("--date") ?? new Date().toISOString().slice(0, 10);
  if (!actor || !reason || !Number.isInteger(maxAdds) || maxAdds < 1 || maxAdds > 5000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < asOf) {
    throw new Error("--apply needs --actor, --reason, --max-adds 1..5000 and a --date on or after --as-of");
  }
  if (base.input || base.pool) throw new Error("--apply reads candidates from the database only");
  return { ...base, apply: { actor, reason, maxAdds, date } };
}

const tally = <T,>(items: T[], key: (item: T) => string) => Object.fromEntries([...items.reduce((m, i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1), new Map<string, number>())]
  .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)));

/** One JSON line for job logs: counts per exchange and exclusion reasons, no prices or vendor figures. */
export function selectionSummary(candidates: Candidate[], selection: Selection) {
  const exchange = (c: { exchange?: string }) => c.exchange ?? "US";
  const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
  return { target: selection.criteria.target, candidates: candidates.length, candidatesByExchange: tally(candidates, exchange),
    selected: selection.selected.length, selectedByExchange: tally(selection.selected, exchange),
    adds: selection.selected.filter((r) => r.list === "extended").length, addsByExchange: tally(selection.selected.filter((r) => r.list === "extended"), exchange),
    excludedByReason: tally(selection.excluded, (e) => e.reason),
    excludedByExchangeAndReason: tally(selection.excluded, (e) => `${exchange(byTicker.get(e.ticker) ?? {})}:${e.reason}`) };
}

export function writeReport(candidates: Candidate[], opts: { asOf: string; out: string; target: number }): { selected: string; excluded: string; selection: Selection } {
  const selection = selectUniverse(candidates, { target: opts.target });
  const selectedText = selectedCsv(selection), excludedText = excludedCsv(selection);
  const hashes = { selected: sha256(selectedText), excluded: sha256(excludedText) };
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, "selected.csv"), selectedText);
  writeFileSync(join(opts.out, "excluded.csv"), excludedText);
  writeFileSync(join(opts.out, "review.md"), reviewMarkdown(selection, opts.asOf, hashes));
  return { ...hashes, selection };
}

/** Adds the proposed names (list extended, collect only) through the universe-change path, in selection order, up to maxAdds. Active members are skipped. */
export async function applySelection(db: Pick<pg.Pool, "connect" | "query">, selection: Selection, apply: NonNullable<SelectArgs["apply"]>): Promise<{ added: string[]; skipped: string[]; failed: { ticker: string; reason: string }[] }> {
  const active = new Set((await db.query<{ ticker: string }>("SELECT ticker FROM universe_membership WHERE valid_to IS NULL")).rows.map((r) => r.ticker));
  const added: string[] = [], skipped: string[] = [], failed: { ticker: string; reason: string }[] = [];
  for (const row of selection.selected.filter((r) => r.list === "extended")) {
    if (active.has(row.ticker)) { skipped.push(row.ticker); continue; }
    if (added.length >= apply.maxAdds) break;
    try {
      await changeUniverse(db, { action: "add", ticker: row.ticker, date: apply.date, reason: apply.reason, actor: apply.actor, name: row.name, sector: row.sector,
        exchange: row.exchange ?? "US", list: "extended", tier: null, criteriaVersion: CRITERIA_VERSION });
      added.push(row.ticker);
    } catch (error) { failed.push({ ticker: row.ticker, reason: error instanceof Error ? error.message : "add failed" }); }
  }
  return { added, skipped, failed };
}

if (/(?:^|[/\\])select-universe\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const opts = parseArgs(process.argv.slice(2));
  const run = async () => {
    let candidates: Candidate[];
    if (opts.input) candidates = JSON.parse(readFileSync(opts.input, "utf8")) as Candidate[];
    else {
      if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL or --input is required");
      const sec = opts.secTickers ? Object.values(JSON.parse(readFileSync(opts.secTickers, "utf8")) as Record<string, { ticker: string; cik_str: number }>) : [];
      const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      try { candidates = await loadCandidates(db, opts.asOf, new Map(sec.map((s) => [s.ticker, s.cik_str]))); } finally { await db.end(); }
    }
    if (opts.pool) candidates = mergePool(candidates, JSON.parse(readFileSync(opts.pool, "utf8")) as PoolRowWithForms[]);
    const { selection, ...hashes } = writeReport(candidates, opts);
    process.stdout.write(`${JSON.stringify(selectionSummary(candidates, selection))}\n`);
    process.stdout.write(`selected.csv ${hashes.selected}\nexcluded.csv ${hashes.excluded}\nwrote ${opts.out}\n`);
    if (!opts.apply) { process.stdout.write("dry run, no database write\n"); return; }
    const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await applySelection(db, selection, opts.apply);
      process.stdout.write(`${JSON.stringify({ applied: true, date: opts.apply.date, added: result.added.length, skipped: result.skipped.length, failed: result.failed })}\n`);
      process.stdout.write(`added ${result.added.join(",")}\n`);
      if (result.failed.length) process.exitCode = 1;
    } finally { await db.end(); }
  };
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
