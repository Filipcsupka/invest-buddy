import pg from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergePool, type PoolRowWithForms } from "../src/universe/forms";
import { excludedCsv, reviewMarkdown, selectedCsv, selectUniverse, sha256, UNIVERSE_CRITERIA, type Candidate } from "../src/universe/select";
import { loadCandidates } from "../src/universe/candidates";
export { loadCandidates } from "../src/universe/candidates";

/** D35 dry run: ranks universe candidates and writes CSV and review files. Reads only; no database write. */
export function parseArgs(args: string[]): { asOf: string; out: string; target: number; input?: string; secTickers?: string; pool?: string; dryRun: boolean } {
  const dryRun = args.includes("--dry-run");
  args = args.filter((arg) => arg !== "--dry-run");
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || args[i + 1] === undefined || flags.has(args[i])) throw new Error("Invalid select-universe arguments");
    flags.set(args[i], args[i + 1]);
  }
  const allowed = new Set(["--as-of", "--out", "--target", "--input", "--sec-tickers", "--pool"]);
  if ([...flags.keys()].some((k) => !allowed.has(k))) throw new Error("Unknown select-universe option");
  const asOf = flags.get("--as-of");
  const target = Number(flags.get("--target") ?? UNIVERSE_CRITERIA.target);
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isInteger(target) || target < 36 || target > 300) {
    throw new Error("Usage: select-universe --as-of YYYY-MM-DD [--target 36..300] [--out DIR] [--input candidates.json | DATABASE_URL] [--sec-tickers company_tickers.json] [--pool pool.json]");
  }
  return { asOf, out: flags.get("--out") ?? "tmp/universe", target, input: flags.get("--input"), secTickers: flags.get("--sec-tickers"), pool: flags.get("--pool"), dryRun };
}

export function writeReport(candidates: Candidate[], opts: { asOf: string; out: string; target: number }): { selected: string; excluded: string } {
  const selection = selectUniverse(candidates, { target: opts.target });
  const selectedText = selectedCsv(selection), excludedText = excludedCsv(selection);
  const hashes = { selected: sha256(selectedText), excluded: sha256(excludedText) };
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, "selected.csv"), selectedText);
  writeFileSync(join(opts.out, "excluded.csv"), excludedText);
  writeFileSync(join(opts.out, "review.md"), reviewMarkdown(selection, opts.asOf, hashes));
  return hashes;
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
    const hashes = writeReport(candidates, opts);
    process.stdout.write(`selected.csv ${hashes.selected}\nexcluded.csv ${hashes.excluded}\nwrote ${opts.out} (dry run, no database write)\n`);
  };
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
