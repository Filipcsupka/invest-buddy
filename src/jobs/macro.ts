import { runLoggedJob } from "./job-log";
import { createHash } from "node:crypto";
import pg from "pg";
import universe from "../../scanner/universe.json";
import { collectFredSeries, FRED_CPI_SERIES, FRED_PPI_SERIES, FRED_YIELD_SERIES, fredSeriesUrl } from "../collectors/fred";
import { defaultHttp, type SourceHttp } from "../collectors/sources/client";
import { collectVix } from "../collectors/sources/vix";
import type { Company, Env } from "../collectors/sources/common";
import { PostgresCollectorRepository, type CollectorRepository } from "../db/collectors";
import { lastCompletedSession } from "../data/trading-calendar";
import { isIsoDate } from "../db/iso-date";
import { loadUniverse } from "../db/universe";
import { storedMacroSeries } from "../db/macro-observations";
import { storeDailyEcbFx, storeDailyMacroObservations } from "./macro-observations";
import { evaluateBenchmarkTrend, evaluateDataTailwind, evaluateSectorRotation, macroConfig, MACRO_RULES_VERSION, REGIONAL_MACRO_RULES_VERSION, type Bar, type MacroConfig, type MacroResult, type VixPoint, type YieldPoint } from "../data/macro-rules";
import { instrumentRegion, REGION_BENCHMARKS, type Region } from "../universe/region";

export const BENCHMARK = REGION_BENCHMARKS.US;
/** Evidence url for the VIX document. The page url is the stored document url, not the CSV link. */
export const VIX_DOC_URL = "https://www.cboe.com/tradable_products/vix/vix_historical_data/#VIX";
const RUNNER = "data_rule";
const symbols = (universe.instruments as { symbol: string }[]).map((item) => item.symbol);

/** Last completed NYSE session in New York, holidays included (src/data/trading-calendar.ts). */
export function previousTradingDay(now = new Date()): string {
  return lastCompletedSession(now);
}

/** Bars of one non-US region: its universe names and its price benchmark (src/universe/region.ts). */
export interface RegionalInputs { universe: Record<string, Bar[]>; benchmark: Bar[] | null }
/** `universe` and `spy` hold the US names and SPY. `europe` is null or absent when no European listing is in the universe. */
export interface MacroInputs { yields: YieldPoint[] | null; yieldUrl: string | null; cpi: YieldPoint[] | null; cpiUrl: string | null; ppi: YieldPoint[] | null; ppiUrl: string | null; vix: VixPoint[] | null; vixUrl: string | null; universe: Record<string, Bar[]>; spy: Bar[] | null; europe?: RegionalInputs | null }
export interface EvidenceItem { claim: string; url: string; publishedAt: string }
export interface RegionalOutcome { dataTailwind: MacroResult; sectorRotationIntoGrowth: MacroResult }
/** The top-level fields are the US outcome, as before. `regions.Europe` exists only when European inputs were given. */
export interface MacroOutcome { dataTailwind: MacroResult; sectorRotationIntoGrowth: MacroResult; evidence: { dataTailwind: EvidenceItem[]; sectorRotationIntoGrowth: EvidenceItem[] }; regions?: Partial<Record<Exclude<Region, "US">, RegionalOutcome>> }

/**
 * European listings: FRED, Treasury and Cboe VIX describe the US, and no ECB rate or HICP series is collected (only ECB FX). So the
 * macro tailwind is the regional benchmark trend, and rotation compares the European names with the regional benchmark. Both rest
 * on our own price bars and cite no document.
 */
export function evaluateRegion(inputs: RegionalInputs, benchmark: string, asOf: string, config: MacroConfig): RegionalOutcome {
  return { dataTailwind: evaluateBenchmarkTrend(inputs.benchmark, asOf, benchmark, config),
    sectorRotationIntoGrowth: evaluateSectorRotation(inputs.universe, inputs.benchmark, asOf, config, benchmark, REGIONAL_MACRO_RULES_VERSION) };
}

/** Pure: applies both rules to stored inputs. Evidence is the url of each stored document the verdict rests on, only for a known value. */
export function evaluateMacro(inputs: MacroInputs, asOf: string, config: MacroConfig): MacroOutcome {
  const dataTailwind = evaluateDataTailwind(inputs.yields, inputs.vix, asOf, config, { cpi: inputs.cpi, ppi: inputs.ppi });
  const sectorRotationIntoGrowth = evaluateSectorRotation(inputs.universe, inputs.spy, asOf, config);
  const [yieldDate, vixDate, cpiDate, ppiDate] = dataTailwind.evidenceDates;
  const items = dataTailwind.value === null || !inputs.yieldUrl || !inputs.vixUrl ? [] : [
    { claim: "macro.dataTailwind", url: inputs.yieldUrl, publishedAt: yieldDate }, { claim: "macro.dataTailwind", url: inputs.vixUrl, publishedAt: vixDate }];
  if (cpiDate && ppiDate && inputs.cpiUrl && inputs.ppiUrl) items.push(
    { claim: "macro.dataTailwind", url: inputs.cpiUrl, publishedAt: cpiDate },
    { claim: "macro.dataTailwind", url: inputs.ppiUrl, publishedAt: ppiDate });
  // Rotation uses our own stored price bars, which have no public url, so it cites no document.
  const outcome: MacroOutcome = { dataTailwind, sectorRotationIntoGrowth, evidence: { dataTailwind: items, sectorRotationIntoGrowth: [] } };
  if (inputs.europe) outcome.regions = { Europe: evaluateRegion(inputs.europe, REGION_BENCHMARKS.Europe, asOf, config) };
  return outcome;
}

/** Region per ticker from its membership exchange on asOf, else its key suffix. */
export async function loadRegions(pool: Pick<pg.Pool, "query">, asOf: string, tickers: string[]): Promise<Map<string, Region>> {
  const rows = await pool.query<{ ticker: string; exchange: string }>(`SELECT DISTINCT ON (ticker) ticker,exchange FROM universe_membership
    WHERE ticker = ANY($1::text[]) AND valid_from <= $2::date AND (valid_to IS NULL OR valid_to > $2::date) ORDER BY ticker,valid_from DESC`, [tickers, asOf]);
  const exchange = new Map(rows.rows.map((row) => [row.ticker, row.exchange]));
  return new Map(tickers.map((ticker) => [ticker, instrumentRegion(ticker, exchange.get(ticker))]));
}
const regionOf = (regions: Map<string, Region> | undefined, ticker: string): Region => regions?.get(ticker) ?? instrumentRegion(ticker);

interface DocRow { url: string; meta: { observations?: YieldPoint[]; close?: number; date?: string; recent?: { date: string; close: number }[] } }
export async function loadInputs(pool: pg.Pool, asOf: string, tickers: string[] = symbols, regions?: Map<string, Region>): Promise<MacroInputs> {
  const yieldUrl = fredSeriesUrl(FRED_YIELD_SERIES), cpiUrl = fredSeriesUrl(FRED_CPI_SERIES), ppiUrl = fredSeriesUrl(FRED_PPI_SERIES);
  const docs = await pool.query<DocRow>("SELECT url,meta FROM source_documents WHERE url = ANY($1::text[])", [[yieldUrl, cpiUrl, ppiUrl, VIX_DOC_URL]]);
  const doc = (url: string) => docs.rows.find((row) => row.url === url);
  const yieldDoc = doc(yieldUrl), cpiDoc = doc(cpiUrl), ppiDoc = doc(ppiUrl), vixDoc = doc(VIX_DOC_URL);
  const docSeries = (row: DocRow | undefined): YieldPoint[] | null => {
    const observations = row?.meta.observations;
    return Array.isArray(observations) ? observations.filter((p) => typeof p.date === "string" && Number.isFinite(p.value)) : null;
  };
  // D24: prefer the stored observations (same window sizes as the document). The document stays the evidence link and the fallback.
  // Stored observations are used only when they are at least as many as the document's, so the rule never sees less history than before.
  const yieldStored = await storedMacroSeries(pool, FRED_YIELD_SERIES, asOf, 80);
  const cpiStored = await storedMacroSeries(pool, FRED_CPI_SERIES, asOf, 24);
  const ppiStored = await storedMacroSeries(pool, FRED_PPI_SERIES, asOf, 24);
  const series = (row: DocRow | undefined, stored: YieldPoint[]): YieldPoint[] | null => {
    const fromDoc = docSeries(row);
    return stored.length && stored.length >= (fromDoc?.length ?? 0) ? stored : fromDoc;
  };
  const vixMeta = vixDoc?.meta;
  const vix = vixMeta ? [...(vixMeta.recent ?? []), ...(vixMeta.date && Number.isFinite(vixMeta.close) ? [{ date: vixMeta.date, close: vixMeta.close as number }] : [])].filter((p) => typeof p.date === "string" && Number.isFinite(p.close)) : null;
  const us = tickers.filter((ticker) => regionOf(regions, ticker) === "US"), europe = tickers.filter((ticker) => regionOf(regions, ticker) === "Europe");
  const benchmarks = europe.length ? [BENCHMARK, REGION_BENCHMARKS.Europe] : [BENCHMARK];
  const rows = await pool.query<{ ticker: string; date: string; close: number }>("SELECT ticker,bar_date::text AS date,close::float8 AS close FROM daily_bars WHERE ticker = ANY($1::text[]) AND bar_date <= $2::date AND bar_date > $2::date - 90 ORDER BY ticker,bar_date", [[...tickers, ...benchmarks], asOf]);
  const byTicker: Record<string, Bar[]> = {};
  for (const row of rows.rows) (byTicker[row.ticker] ??= []).push({ date: row.date, close: row.close });
  const bars = (names: string[]) => Object.fromEntries(names.map((ticker) => [ticker, byTicker[ticker] ?? []]));
  return { yields: series(yieldDoc, yieldStored), yieldUrl: yieldDoc ? yieldUrl : null, cpi: series(cpiDoc, cpiStored), cpiUrl: cpiDoc ? cpiUrl : null, ppi: series(ppiDoc, ppiStored), ppiUrl: ppiDoc ? ppiUrl : null, vix, vixUrl: vixDoc ? VIX_DOC_URL : null,
    universe: bars(us), spy: byTicker[BENCHMARK] ?? null, europe: europe.length ? { universe: bars(europe), benchmark: byTicker[REGION_BENCHMARKS.Europe] ?? null } : null };
}

/** The ECB fetch runs only when ECB_FX_ENABLED is exactly "on". Off by default, so the macro CronJob does not start it on deploy. */
export const ecbFxEnabled = (env: Env) => env.ECB_FX_ENABLED === "on";

export interface FetchDeps { http?: SourceHttp; env?: Env; now?: Date; get?: (url: string) => Promise<string> }
/** Refreshes the stored macro inputs. A failing source is reported and skipped. */
export async function fetchMacroInputs(repository: CollectorRepository, deps: FetchDeps = {}): Promise<string[]> {
  const env = deps.env ?? process.env, now = deps.now ?? new Date(), failures: string[] = [];
  const key = env.FRED_API_KEY;
  if (!key) failures.push("fred: FRED_API_KEY absent");
  else for (const [series, limit] of [[FRED_YIELD_SERIES, 80], [FRED_CPI_SERIES, 24], [FRED_PPI_SERIES, 24]] as const) {
    try { await repository.upsertDocument(await collectFredSeries(key, series, deps.get, limit)); }
    catch (error) { failures.push(`fred ${series}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const stored = await storeDailyMacroObservations(repository, { key, http: deps.http ?? defaultHttp(), get: deps.get, now });
  failures.push(...stored.failures);
  if (ecbFxEnabled(env)) failures.push(...(await storeDailyEcbFx(repository, deps.http ?? defaultHttp())).failures);
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
 * Each ticker gets the outcome of its region; the top-level macro_findings values stay the US ones, and `regions` holds the others.
 * Reconcile leaves data_rule rows alone. Rerunning for the same date rewrites the same rows.
 */
export async function writeMacro(pool: pg.Pool, asOf: string, outcome: MacroOutcome, config: MacroConfig, tickers: string[] = symbols, regions?: Map<string, Region>): Promise<number> {
  const runId = macroRunId(asOf);
  const usFields = [["dataTailwind", outcome.dataTailwind], ["sectorRotationIntoGrowth", outcome.sectorRotationIntoGrowth]] as const;
  const fieldsFor = (ticker: string) => {
    const region = regionOf(regions, ticker);
    if (region === "US") return usFields;
    const regional = outcome.regions?.[region];
    if (!regional) throw new Error(`No ${region} macro outcome for ${ticker}`);
    return [["dataTailwind", regional.dataTailwind], ["sectorRotationIntoGrowth", regional.sectorRotationIntoGrowth]] as const;
  };
  const regional = Object.entries(outcome.regions ?? {}).map(([region, item]) => [region, { rulesVersion: REGIONAL_MACRO_RULES_VERSION,
    benchmark: REGION_BENCHMARKS[region as Region], dataTailwind: item.dataTailwind.value, sectorRotationIntoGrowth: item.sectorRotationIntoGrowth.value,
    notes: `${item.dataTailwind.reason}. ${item.sectorRotationIntoGrowth.reason}`.slice(0, 1000) }] as const);
  const data = { runnerName: RUNNER, rulesVersion: MACRO_RULES_VERSION, placeholder: true, config, dataTailwind: outcome.dataTailwind.value, sectorRotationIntoGrowth: outcome.sectorRotationIntoGrowth.value,
    notes: `${outcome.dataTailwind.reason}. ${outcome.sectorRotationIntoGrowth.reason}`.slice(0, 1000), events: [], ...(regional.length ? { regions: Object.fromEntries(regional) } : {}) };
  const items = [...outcome.evidence.dataTailwind, ...outcome.evidence.sectorRotationIntoGrowth];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO scan_runs (run_id,as_of,generated_at,runner) VALUES ($1,$2,now(),$3::jsonb) ON CONFLICT (run_id) DO UPDATE SET generated_at=now()", [runId, asOf, JSON.stringify({ name: RUNNER, model: MACRO_RULES_VERSION })]);
    await client.query("INSERT INTO macro_findings (run_id,as_of,data,evidence) VALUES ($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT (run_id) DO UPDATE SET data=EXCLUDED.data,evidence=EXCLUDED.evidence,received_at=now(),superseded_by=NULL",
      [runId, asOf, JSON.stringify(data), JSON.stringify({ items, flags: {} })]);
    let rows = 0;
    for (const ticker of tickers) for (const [field, result] of fieldsFor(ticker)) {
      // Only the US tailwind cites stored documents; regional rules rest on our own bars.
      const refs = regionOf(regions, ticker) !== "US" ? [] : field === "dataTailwind" ? outcome.evidence.dataTailwind : outcome.evidence.sectorRotationIntoGrowth;
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
  const tickers = options.tickers ?? symbols;
  const regions = await loadRegions(pool, asOf, tickers);
  const outcome = evaluateMacro(await loadInputs(pool, asOf, tickers, regions), asOf, config);
  const rows = await writeMacro(pool, asOf, outcome, config, tickers, regions);
  return { asOf, rows, failures, dataTailwind: outcome.dataTailwind, sectorRotationIntoGrowth: outcome.sectorRotationIntoGrowth, regions: outcome.regions ?? {} };
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
    for (const [region, item] of Object.entries(result.regions)) process.stdout.write(`${region}: ${show("dataTailwind", item.dataTailwind)} ${show("sectorRotationIntoGrowth", item.sectorRotationIntoGrowth)}\n${item.dataTailwind.reason}\n${item.sectorRotationIntoGrowth.reason}\n`);
    if (result.failures.length) process.stderr.write(`Macro fetch failures: ${result.failures.length}\n`);
    return { consensusRows: result.rows, failures: result.failures.length };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])macro\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("macro", main);
