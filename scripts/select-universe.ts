import pg from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergePool, type PoolRowWithForms } from "../src/universe/forms";
import { barMetrics, excludedCsv, reviewMarkdown, revenueGrowth, selectedCsv, selectUniverse, sha256, UNIVERSE_CRITERIA, type Candidate } from "../src/universe/select";
import { REVENUE_CONCEPTS } from "../src/collectors/sources/frames";

/** D35 dry run: ranks universe candidates and writes CSV and review files. Reads only; no database write. */
export function parseArgs(args: string[]): { asOf: string; out: string; target: number; input?: string; secTickers?: string; pool?: string } {
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
  return { asOf, out: flags.get("--out") ?? "tmp/universe", target, input: flags.get("--input"), secTickers: flags.get("--sec-tickers"), pool: flags.get("--pool") };
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

type Q = Pick<pg.Pool, "query">;

export async function loadCandidates(db: Q, asOf: string, secCik: Map<string, number>): Promise<Candidate[]> {
  const members = await db.query<{ ticker: string; list: string }>(
    "SELECT ticker,list FROM universe_membership WHERE valid_from<=$1 AND (valid_to IS NULL OR valid_to>$1) AND list<>'benchmark'", [asOf]);
  const core = new Set(members.rows.map((r) => r.ticker));
  const names = await db.query<{ symbol: string; name: string; sector: string }>(
    `SELECT DISTINCT ON (symbol) symbol,name,sector FROM (
       SELECT ticker symbol,name,sector,1 p FROM instruments WHERE source<>'benchmark'
       UNION ALL SELECT symbol,name,sector,2 FROM discovery_price_bars) u ORDER BY symbol,p`);
  const bars = await db.query<{ symbol: string; close: string; volume: string }>(
    `SELECT symbol,close,volume FROM (
       SELECT DISTINCT ON (symbol,bar_date) symbol,bar_date,close,volume FROM (
         SELECT ticker symbol,bar_date,close,volume,1 p FROM daily_bars WHERE bar_date<=$1
         UNION ALL SELECT symbol,bar_date,close,volume,2 FROM discovery_price_bars WHERE bar_date<=$1) u ORDER BY symbol,bar_date,p) d
     ORDER BY symbol,bar_date`, [asOf]);
  const barMap = new Map<string, { close: number; volume: number }[]>();
  for (const b of bars.rows) (barMap.get(b.symbol) ?? barMap.set(b.symbol, []).get(b.symbol)!).push({ close: Number(b.close), volume: Number(b.volume) });
  const ids = await db.query<{ ticker: string; cik: string | null }>("SELECT ticker,cik::text FROM instrument_ids WHERE valid_to IS NULL AND cik IS NOT NULL");
  const cikMap = new Map(ids.rows.map((r) => [r.ticker, Number(r.cik)]));
  const forms = await db.query<{ symbol: string; form: string }>("SELECT DISTINCT symbol,form FROM filing_watch WHERE filed_at<=$1", [asOf]);
  const formMap = new Map<string, string[]>();
  for (const f of forms.rows) (formMap.get(f.symbol) ?? formMap.set(f.symbol, []).get(f.symbol)!).push(f.form);
  const rev = await db.query<{ ticker: string; concept: string; period_end: string; value: string; form: string }>(
    `SELECT DISTINCT ON (ticker,concept,period_end) ticker,concept,period_end::text,value::text,form FROM fundamentals_pit
     WHERE taxonomy='us-gaap' AND unit='USD' AND concept=ANY($1) AND filed<=$2 AND period_start IS NOT NULL AND period_end-period_start BETWEEN 80 AND 100
     ORDER BY ticker,concept,period_end,filed DESC`, [[...REVENUE_CONCEPTS], asOf]);
  const revMap = new Map<string, Map<string, { periodEnd: string; value: number }[]>>();
  for (const r of rev.rows) {
    const byConcept = revMap.get(r.ticker) ?? revMap.set(r.ticker, new Map()).get(r.ticker)!;
    (byConcept.get(r.concept) ?? byConcept.set(r.concept, []).get(r.concept)!).push({ periodEnd: r.period_end, value: Number(r.value) });
    (formMap.get(r.ticker) ?? formMap.set(r.ticker, []).get(r.ticker)!).push(r.form);
  }
  return names.rows.map((n) => {
    const concepts = [...(revMap.get(n.symbol)?.entries() ?? [])].sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1));
    const growth = revenueGrowth(concepts[0]?.[1] ?? []);
    return { ticker: n.symbol, name: n.name, sector: n.sector, cik: cikMap.get(n.symbol) ?? secCik.get(n.symbol) ?? null, forms: formMap.get(n.symbol) ?? [],
      core: core.has(n.symbol), revenueQuarters: growth.quarters, yoyGrowthPct: growth.yoyGrowthPct, ...barMetrics(barMap.get(n.symbol) ?? []) };
  });
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
