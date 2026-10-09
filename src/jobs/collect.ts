import { runLoggedJob } from "./job-log";
import pg from "pg";
import universe from "../../scanner/universe.json";
import { collectEdgar, companyCiks, foreignFilerStatus, FOREIGN_FILER_FACT, type InsiderTrade } from "../collectors/edgar";
import { collectRss } from "../collectors/rss";
import { collectFred } from "../collectors/fred";
import { RateLimitLockout } from "../collectors/http";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import type { CollectedDocument } from "../collectors/types";
import { documentRetentionDays, MemoryCollectorRepository, PostgresCollectorRepository, type CollectorRepository, type Fact, type CollectorRun } from "../db/collectors";
import type { Company } from "../collectors/sources/common";
import { DEFAULT_SYMBOL_MAP } from "../data/twelvedata";
import { EXTRA_SOURCES, LEGACY_SOURCES, type SourceName } from "../collectors/types";
import type { SourceHttp } from "../collectors/sources/client";
import { formatPings, isExtra, runExtraSources, runPings } from "../collectors/sources/registry";
import { MemoryCusipStore, PostgresCusipStore, type CusipStore } from "../db/source-collectors";
import { isIsoDate } from "../db/iso-date";
import { loadUniverse } from "../db/universe";

const companies = universe.instruments as Company[];
const daysAgo = (date: Date, days: number) => new Date(date.getTime() - days * 86400000).toISOString().slice(0, 10);
export interface CollectOptions { since?: string; sources?: string[]; dryRun?: boolean; now?: () => Date; get?: (url: string) => Promise<string>; http?: SourceHttp; cusips?: CusipStore; companies?: Company[] }
/** Phase A collectors (edgar, rss, fred) run as before. Phase A2 sources (`EXTRA_SOURCES`) run through the source registry. */
export async function runCollect(repository: CollectorRepository, symbols: string[], options: CollectOptions = {}) {
  const companies = options.companies ?? universe.instruments as Company[];
  const requested = options.sources ?? ["edgar", "rss"];
  const extra = requested.filter(isExtra), basic = requested.filter((name) => !isExtra(name));
  const first = basic.length ? await runLegacyCollect(repository, symbols, { ...options, sources: basic }) : undefined;
  if (!extra.length) return first!;
  const now = options.now?.() ?? new Date();
  const second = await runExtraSources(repository, extra, { since: options.since ?? daysAgo(now, 30), now, dryRun: options.dryRun, http: options.http, cusips: options.cusips, companies, symbols });
  if (!first) return second;
  return { ...first, sources: requested, requested: first.requested + second.requested, succeeded: first.succeeded + second.succeeded, failures: [...first.failures, ...second.failures],
    documentsWritten: first.documentsWritten + second.documentsWritten, factsWritten: first.factsWritten + second.factsWritten, stoppedReason: first.stoppedReason ?? second.stoppedReason,
    documentsParsed: first.documentsParsed + second.documentsParsed, factsComputed: first.factsComputed + second.factsComputed, exitCode: first.exitCode || second.exitCode };
}
async function runLegacyCollect(repository: CollectorRepository, symbols: string[], options: CollectOptions = {}) {
  const companies = options.companies ?? universe.instruments as Company[];
  const now = options.now?.() ?? new Date();
  const asOf = now.toISOString().slice(0, 10);
  // SEC filings count as evidence for up to 100 days (earnings and guidance), so the default window matches that.
  const since = options.since ?? daysAgo(now, 100);
  const sources = options.sources ?? ["edgar", "rss"];
  const run: CollectorRun = { startedAt: now.toISOString(), sources, requested: symbols.length, succeeded: 0, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null };
  let documentsParsed = 0, factsComputed = 0;
  const get = options.get;
  if (sources.length === 1 && sources[0] === "fred") {
    const key = process.env.FRED_API_KEY;
    if (!key) {
      process.stderr.write("FRED_API_KEY absent; skipping FRED\n");
      return { ...run, requested: 0, documentsParsed, factsComputed, exitCode: 0 };
    }
    try {
      const doc = await collectFred(key, get);
      documentsParsed++;
      if (!options.dryRun) {
        if ((await repository.upsertDocument(doc)).written) run.documentsWritten++;
        await repository.recordRun({ ...run, requested: 1, succeeded: 1 });
      }
      return { ...run, requested: 1, succeeded: 1, documentsParsed, factsComputed, exitCode: 0 };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failed = { ...run, requested: 1, failures: [{ ticker: "FRED", reason }], stoppedReason: reason };
      if (!options.dryRun) await repository.recordRun(failed);
      return { ...failed, documentsParsed, factsComputed, exitCode: 1 };
    }
  }
  let ciks: Map<string, number> | undefined;
  let rss: CollectedDocument[] = [];
  try {
    if (sources.includes("edgar")) ciks = await companyCiks(get);
    // The press release feed is optional. A slow or blocked feed must not stop the SEC collection, so it is recorded as a failure of its own.
    if (sources.includes("rss")) {
      try { rss = await collectRss(companies, since, get); }
      catch (error) {
        if (!sources.includes("edgar") || error instanceof RateLimitLockout) throw error;
        run.failures.push({ ticker: "rss", reason: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    run.stoppedReason = reason;
    run.failures = symbols.map((ticker) => ({ ticker, reason }));
    if (!options.dryRun) await repository.recordRun(run);
    return { ...run, documentsParsed, factsComputed, exitCode: 1 };
  }
  for (const [index, symbol] of symbols.entries()) {
    try {
      const cik = ciks?.get(symbol) ?? ciks?.get(DEFAULT_SYMBOL_MAP[symbol] ?? symbol);
      if (sources.includes("edgar") && !cik) throw new Error(`No EDGAR CIK for ${symbol}`);
      const docs = [ ...(cik ? await collectEdgar(symbol, cik, since, get, daysAgo(now, 90)) : []), ...rss.filter((doc) => (doc.meta.symbols as string[]).includes(symbol)) ];
      documentsParsed += docs.length;
      const ids = new Map<string, number>();
      for (const doc of docs) {
        if (options.dryRun) continue;
        const stored = await repository.upsertDocument(doc);
        ids.set(doc.url, stored.id);
        if (stored.written) run.documentsWritten++;
      }
      const facts = await deriveFacts(symbol, docs, ids, repository, asOf);
      factsComputed += facts.length;
      if (!options.dryRun) for (const fact of facts) if (await repository.upsertFact(fact)) run.factsWritten++;
      run.succeeded++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      run.failures.push({ ticker: symbol, reason });
      if (error instanceof RateLimitLockout) {
        run.stoppedReason = reason;
        for (const rest of symbols.slice(index + 1)) run.failures.push({ ticker: rest, reason: "not fetched: rate-limit lockout" });
        break;
      }
    }
  }
  if (!options.dryRun) await repository.recordRun(run);
  return { ...run, documentsParsed, factsComputed, exitCode: collectExitCode(run.stoppedReason, run.failures.filter((failure) => failure.ticker !== "rss").length, symbols.length) };
}

/** A lockout or any other stop is always a failed run, whatever share of tickers had already finished. */
export const collectExitCode = (stoppedReason: string | null, failed: number, requested: number) => stoppedReason || (requested && failed / requested > 0.1) ? 1 : 0;

export async function deriveFacts(symbol: string, docs: CollectedDocument[], ids: Map<string, number>, repository: CollectorRepository, asOf: string): Promise<Fact[]> {
  const facts: Fact[] = [];
  const make = (key: string, value: unknown, documents: CollectedDocument[], factDate = asOf) => facts.push({ symbol, key, asOf: factDate, value, documentIds: documents.map((doc) => ids.get(doc.url)).filter((id): id is number => id !== undefined) });
  const trades = docs.filter((doc) => doc.docType === "4" && doc.publishedAt.slice(0, 10) >= daysAgo(new Date(`${asOf}T00:00:00Z`), 90));
  if (trades.length) {
    const entries = trades.flatMap((doc) => (doc.meta.trades as InsiderTrade[] ?? []).filter((trade) => trade.date >= daysAgo(new Date(`${asOf}T00:00:00Z`), 90)));
    // A trade without a usable price adds shares but no dollars. dollarsComplete:false tells the reader netDollars is a lower bound on what was priced.
    const priced = entries.filter((trade) => trade.dollars !== null && trade.dollars !== undefined);
    make("insider_net_buy_90d", {
      netShares: entries.reduce((n, trade) => n + (trade.code === "P" ? trade.shares : -trade.shares), 0),
      netDollars: priced.reduce((n, trade) => n + (trade.code === "P" ? trade.dollars! : -trade.dollars!), 0),
      ...(priced.length < entries.length ? { dollarsComplete: false } : {}),
    }, trades);
  }
  const earnings = docs.filter((doc) => doc.docType === "8-K EX-99.1").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  // Keyed by the filing date, not the run date: the same earnings 8-K must not create a new row (and a new computed_at) every day.
  if (earnings) make("latest_earnings_8k", { date: earnings.publishedAt.slice(0, 10), documentId: ids.get(earnings.url) ?? null }, [earnings], earnings.publishedAt.slice(0, 10));
  const filer = foreignFilerStatus(docs);
  // Dated by the newest foreign filing, so it does not create a row per day. It lives as long as the 20-F and 6-K documents it comes from.
  if (filer) facts.push({ symbol, key: FOREIGN_FILER_FACT, asOf: filer.asOf, value: filer.value, documentIds: docs.filter((doc) => doc.docType === "20-F" || doc.docType === "6-K").map((doc) => ids.get(doc.url)).filter((id): id is number => id !== undefined), expiresAt: new Date(Date.parse(`${filer.asOf}T00:00:00Z`) + documentRetentionDays("20-F") * 86400000).toISOString() });
  const bars = await repository.bars(symbol, 21);
  if (bars.length >= 6 && bars[5].close > 0) make("price_move_5d", { percent: (bars[0].close / bars[5].close - 1) * 100 }, [], bars[0].date);
  if (bars.length >= 21) {
    const average = bars.slice(1, 21).reduce((n, bar) => n + bar.volume, 0) / 20;
    if (average > 0) make("volume_ratio_20d", { ratio: bars[0].volume / average }, [], bars[0].date);
  }
  return facts;
}

/** One line, no credentials: upstream error text can echo a request URL with a key. */
export const safeReason = (reason: unknown) => String(reason).replace(/[\r\n]+/g, " ").replace(/([?&;](?:api_?key|key|token|access_token|secret)=)[^&\s]+/gi, "$1[redacted]").replace(/(bearer\s+)\S+/gi, "$1[redacted]").slice(0, 200);
const SEC_SOURCES = ["edgar", "frames", "getcurrent", "13f"];
/** A run that reaches SEC (no --source, or an SEC source in it) must have a real contact in SEC_USER_AGENT before anything else starts. */
export function guardCollectUserAgent(names: string[] | undefined, env: Record<string, string | undefined>): void {
  if (!names || names.some((name) => SEC_SOURCES.includes(name))) requireSecUserAgent(env.SEC_USER_AGENT);
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const only = option("--only"), since = option("--since"), source = option("--source");
  const dryRun = args.includes("--dry-run"), memory = args.includes("--memory"), ping = args.includes("--ping");
  const consumed = new Set(["--dry-run", "--memory", "--ping"]);
  for (const flag of ["--only", "--since", "--source"]) if (args.includes(flag)) { consumed.add(flag); consumed.add(option(flag) ?? ""); }
  const names = source?.split(",").map((name) => name.trim());
  if (args.some((arg) => !consumed.has(arg)) || (args.includes("--only") && !only) || (args.includes("--since") && !since) || (args.includes("--source") && !source)) throw new Error(`Usage: collect [--only A,B] [--since YYYY-MM-DD] [--source ${[...LEGACY_SOURCES, ...EXTRA_SOURCES].join("|")}[,...]] [--dry-run] [--memory] | collect --ping [--source NAME]`);
  if (since && !isIsoDate(since)) throw new Error("--since requires YYYY-MM-DD");
  const known = new Set<string>([...LEGACY_SOURCES, ...EXTRA_SOURCES]);
  if (names && names.some((name) => !known.has(name) && !(ping && name === "openfigi"))) throw new Error("Unknown source");
  if (ping) {
    const results = await runPings(names);
    process.stdout.write(`${formatPings(results)}\n`);
    process.exitCode = results.some((result) => !result.ok) ? 1 : 0;
    return { checked: results.length, failures: results.filter((result) => !result.ok).length };
  }
  guardCollectUserAgent(names, process.env);
  if (!memory && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; use --memory for a run without a database");
  const pool = memory ? null : new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const activeCompanies = pool ? await loadUniverse(pool) : companies;
    const symbols = only ? [...new Set(only.split(",").map((s) => s.trim().toUpperCase()))] : activeCompanies.map((c) => c.symbol);
    const unknown = symbols.filter((s) => !activeCompanies.some((c) => c.symbol === s));
    if (unknown.length) throw new Error(`Unknown ticker(s): ${unknown.join(", ")}`);
    const repository = pool ? new PostgresCollectorRepository(pool) : new MemoryCollectorRepository();
    const result = await runCollect(repository, symbols, { since, sources: names as SourceName[] | undefined, dryRun, cusips: pool ? new PostgresCusipStore(pool) : new MemoryCusipStore(), companies: activeCompanies });
    process.stdout.write(`Collect: ${result.succeeded}/${result.requested} tickers, ${result.documentsParsed} documents parsed, ${result.factsComputed} facts computed, ${result.documentsWritten} documents written, ${result.factsWritten} facts written${dryRun ? " (dry run, nothing stored)" : ""}\n`);
    for (const failure of result.failures) process.stderr.write(`Failed ${failure.ticker}: ${safeReason(failure.reason)}\n`);
    if (result.stoppedReason) process.stderr.write("Stopped: source limit reached\n");
    process.exitCode = result.exitCode;
    return { requested: result.requested, succeeded: result.succeeded, failures: result.failures.length, documentsWritten: result.documentsWritten, factsWritten: result.factsWritten };
  } finally { await pool?.end(); }
}
if (/(?:^|[/\\])collect\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("collect", main);
