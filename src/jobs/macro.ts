import { runLoggedJob } from "./job-log";
import { createHash } from "node:crypto";
import pg from "pg";
import universe from "../../scanner/universe.json";
import { collectFredSeries, FRED_YIELD_SERIES, fredSeriesUrl } from "../collectors/fred";
import { defaultHttp, type SourceHttp } from "../collectors/sources/client";
import { collectVix } from "../collectors/sources/vix";
import type { Company, Env } from "../collectors/sources/common";
import { PostgresCollectorRepository, type CollectorRepository } from "../db/collectors";
import { lastCompletedSession } from "../data/trading-calendar";
import { isIsoDate } from "../db/iso-date";
import { loadUniverse } from "../db/universe";
import { evaluateDataTailwind, evaluateSectorRotation, macroConfig, MACRO_RULES_VERSION, type Bar, type MacroConfig, type MacroResult, type VixPoint, type YieldPoint } from "../data/macro-rules";

export const BENCHMARK = "SPY";
/** Evidence url for the VIX document. The page url is the stored document url, not the CSV link. */
export const VIX_DOC_URL = "https://www.cboe.com/tradable_products/vix/vix_historical_data/#VIX";
const RUNNER = "data_rule";
const symbols = (universe.instruments as { symbol: string }[]).map((item) => item.symbol);

/** Last completed NYSE session in New York, holidays included (src/data/trading-calendar.ts). */
export function previousTradingDay(now = new Date()): string {
  return lastCompletedSession(now);
}

export interface MacroInputs { yields: YieldPoint[] | null; yieldUrl: string | null; vix: VixPoint[] | null; vixUrl: string | null; universe: Record<string, Bar[]>; spy: Bar[] | null }
export interface EvidenceItem { claim: string; url: string; publishedAt: string }
export interface MacroOutcome { dataTailwind: MacroResult; sectorRotationIntoGrowth: MacroResult; evidence: { dataTailwind: EvidenceItem[]; sectorRotationIntoGrowth: EvidenceItem[] } }

/** Pure: applies both rules to stored inputs. Evidence is the url of each stored document the verdict rests on, only for a known value. */
export function evaluateMacro(inputs: MacroInputs, asOf: string, config: MacroConfig): MacroOutcome {
  const dataTailwind = evaluateDataTailwind(inputs.yields, inputs.vix, asOf, config);
  const sectorRotationIntoGrowth = evaluateSectorRotation(inputs.universe, inputs.spy, asOf, config);
  const [yieldDate, vixDate] = dataTailwind.evidenceDates;
  const items = dataTailwind.value === null || !inputs.yieldUrl || !inputs.vixUrl ? [] : [
    { claim: "macro.dataTailwind", url: inputs.yieldUrl, publishedAt: yieldDate }, { claim: "macro.dataTailwind", url: inputs.vixUrl, publishedAt: vixDate }];
  // Rotation uses our own stored price bars, which have no public url, so it cites no document.
  return { dataTailwind, sectorRotationIntoGrowth, evidence: { dataTailwind: items, sectorRotationIntoGrowth: [] } };
}

interface DocRow { url: string; meta: { observations?: YieldPoint[]; close?: number; date?: string; recent?: { date: string; close: number }[] } }
export async function loadInputs(pool: pg.Pool, asOf: string, tickers: string[] = symbols): Promise<MacroInputs> {
  const yieldUrl = fredSeriesUrl(FRED_YIELD_SERIES);
  const docs = await pool.query<DocRow>("SELECT url,meta FROM source_documents WHERE url = ANY($1::text[])", [[yieldUrl, VIX_DOC_URL]]);
  const doc = (url: string) => docs.rows.find((row) => row.url === url);
  const yieldDoc = doc(yieldUrl), vixDoc = doc(VIX_DOC_URL);
  const observations = yieldDoc?.meta.observations;
  const yields = Array.isArray(observations) ? observations.filter((p) => typeof p.date === "string" && Number.isFinite(p.value)) : null;
  const vixMeta = vixDoc?.meta;
  const vix = vixMeta ? [...(vixMeta.recent ?? []), ...(vixMeta.date && Number.isFinite(vixMeta.close) ? [{ date: vixMeta.date, close: vixMeta.close as number }] : [])].filter((p) => typeof p.date === "string" && Number.isFinite(p.close)) : null;
  const rows = await pool.query<{ ticker: string; date: string; close: number }>("SELECT ticker,bar_date::text AS date,close::float8 AS close FROM daily_bars WHERE ticker = ANY($1::text[]) AND bar_date <= $2::date AND bar_date > $2::date - 90 ORDER BY ticker,bar_date", [[...tickers, BENCHMARK], asOf]);
  const byTicker: Record<string, Bar[]> = {};
  for (const row of rows.rows) (byTicker[row.ticker] ??= []).push({ date: row.date, close: row.close });
  return { yields, yieldUrl: yieldDoc ? yieldUrl : null, vix, vixUrl: vixDoc ? VIX_DOC_URL : null,
    universe: Object.fromEntries(tickers.map((ticker) => [ticker, byTicker[ticker] ?? []])), spy: byTicker[BENCHMARK] ?? null };
}

export interface FetchDeps { http?: SourceHttp; env?: Env; now?: Date; get?: (url: string) => Promise<string> }
/** Refreshes the two stored inputs. A failing source is reported and skipped; the rules then read what is stored and call old data stale. */
export async function fetchMacroInputs(repository: CollectorRepository, deps: FetchDeps = {}): Promise<string[]> {
  const env = deps.env ?? process.env, now = deps.now ?? new Date(), failures: string[] = [];
  const key = env.FRED_API_KEY;
  if (!key) failures.push("fred: FRED_API_KEY absent");
  else try { await repository.upsertDocument(await collectFredSeries(key, FRED_YIELD_SERIES, deps.get)); } catch (error) { failures.push(`fred: ${error instanceof Error ? error.message : String(error)}`); }
  try {
    const output = await collectVix({ http: deps.http ?? defaultHttp(), companies: [] as Company[], symbols: [], since: now.toISOString().slice(0, 10), now, env });
    for (const document of output.documents) await repository.upsertDocument(document);
  } catch (error) { failures.push(`vix: ${error instanceof Error ? error.message : String(error)}`); }
  return failures;
}

/** One stable run id per date, so a rerun replaces the row instead of adding another. */
export function macroRunId(asOf: string): string {
  const hex = createHash("sha256").update(`macro-data-rule:${asOf}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const upsertConsensus = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
  VALUES ($1,$2,$3,$4,'data_rule','{}'::jsonb,$5::jsonb,$6,$7)
  ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,carried_from=NULL,reconciled_at=now()`;

/**
 * Stores the outcome for one date: one macro_findings row (runner data_rule, with its own scan_runs row) and, for every universe ticker,
 * the two macro fields in consensus_findings with agreement data_rule. A known value is verified; unknown is value null, not verified.
 * Reconcile leaves data_rule rows alone. Rerunning for the same date rewrites the same rows.
 */
export async function writeMacro(pool: pg.Pool, asOf: string, outcome: MacroOutcome, config: MacroConfig, tickers: string[] = symbols): Promise<number> {
  const runId = macroRunId(asOf);
  const fields = [["dataTailwind", outcome.dataTailwind], ["sectorRotationIntoGrowth", outcome.sectorRotationIntoGrowth]] as const;
  const data = { runnerName: RUNNER, rulesVersion: MACRO_RULES_VERSION, placeholder: true, config, dataTailwind: outcome.dataTailwind.value, sectorRotationIntoGrowth: outcome.sectorRotationIntoGrowth.value,
    notes: `${outcome.dataTailwind.reason}. ${outcome.sectorRotationIntoGrowth.reason}`.slice(0, 1000), events: [] };
  const items = [...outcome.evidence.dataTailwind, ...outcome.evidence.sectorRotationIntoGrowth];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO scan_runs (run_id,as_of,generated_at,runner) VALUES ($1,$2,now(),$3::jsonb) ON CONFLICT (run_id) DO UPDATE SET generated_at=now()", [runId, asOf, JSON.stringify({ name: RUNNER, model: MACRO_RULES_VERSION })]);
    await client.query("INSERT INTO macro_findings (run_id,as_of,data,evidence) VALUES ($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT (run_id) DO UPDATE SET data=EXCLUDED.data,evidence=EXCLUDED.evidence,received_at=now(),superseded_by=NULL",
      [runId, asOf, JSON.stringify(data), JSON.stringify({ items, flags: {} })]);
    let rows = 0;
    for (const ticker of tickers) for (const [field, result] of fields) {
      const refs = field === "dataTailwind" ? outcome.evidence.dataTailwind : outcome.evidence.sectorRotationIntoGrowth;
      await client.query(upsertConsensus, [ticker, field, asOf, result.value, JSON.stringify(refs), result.value !== null, result.reason.slice(0, 500)]);
      rows++;
    }
    await client.query("COMMIT");
    return rows;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function runMacro(pool: pg.Pool, asOf: string, options: { fetch?: boolean; deps?: FetchDeps; config?: MacroConfig; tickers?: string[] } = {}) {
  const config = options.config ?? macroConfig();
  const failures = options.fetch === false ? [] : await fetchMacroInputs(new PostgresCollectorRepository(pool), options.deps);
  const outcome = evaluateMacro(await loadInputs(pool, asOf, options.tickers), asOf, config);
  const rows = await writeMacro(pool, asOf, outcome, config, options.tickers);
  return { asOf, rows, failures, dataTailwind: outcome.dataTailwind, sectorRotationIntoGrowth: outcome.sectorRotationIntoGrowth };
}

async function main() {
  const args = process.argv.slice(2);
  const dateIndex = args.indexOf("--date");
  const noFetch = args.includes("--no-fetch");
  if (args.some((arg, index) => arg !== "--date" && arg !== "--no-fetch" && index !== dateIndex + 1) || (dateIndex >= 0 && !args[dateIndex + 1])) throw new Error("Usage: macro [--date YYYY-MM-DD] [--no-fetch]");
  const asOf = dateIndex >= 0 ? args[dateIndex + 1] : previousTradingDay();
  if (!isIsoDate(asOf)) throw new Error("--date requires YYYY-MM-DD");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await runMacro(pool, asOf, { fetch: !noFetch, tickers: (await loadUniverse(pool)).map((item) => item.symbol) });
    const show = (name: string, item: MacroResult) => `${name}=${item.value === null ? "unknown" : item.value}`;
    process.stdout.write(`Macro ${asOf}: ${show("dataTailwind", result.dataTailwind)} ${show("sectorRotationIntoGrowth", result.sectorRotationIntoGrowth)}, ${result.rows} consensus rows\n${result.dataTailwind.reason}\n${result.sectorRotationIntoGrowth.reason}\n`);
    if (result.failures.length) process.stderr.write(`Macro fetch failures: ${result.failures.length}\n`);
    return { consensusRows: result.rows, failures: result.failures.length };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])macro\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("macro", main);
