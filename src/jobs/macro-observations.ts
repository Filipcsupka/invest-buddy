import { getText } from "../collectors/http";
import { defaultHttp, type SourceHttp } from "../collectors/sources/client";
import { fredObservationsUrl, parseFredMacro, parseTreasuryCurve, treasuryCurveUrl, type MacroObservation } from "../collectors/macro-observations";
import type { CollectorRepository } from "../db/collectors";
import { MACRO_HISTORY_START, storableFredSeries } from "../data/macro-series";
import { ECB_HIST_90D_URL, ECB_HIST_URL, parseEcbFx } from "../collectors/ecb-fx";
import type { BackfillJob } from "./backfill";

type Store = Pick<CollectorRepository, "upsertMacroObservations">;
const today = (now: Date) => now.toISOString().slice(0, 10);
const startYear = Number(MACRO_HISTORY_START.slice(0, 4));

/**
 * Backfill of FRED history, one request per series and calendar year from MACRO_HISTORY_START. The cursor is the next year,
 * so an interrupted run continues at the year it stopped. Source `fred` is the ledger source.
 */
export function createMacroFredBackfillJob(repo: Store, key: string, get: (url: string) => Promise<string> = getText, now: () => Date = () => new Date()): BackfillJob {
  return { name: "macro-fred", source: "fred",
    async subjects() { return storableFredSeries().map((series) => series.id); },
    async step(series, previous) {
      const year = (previous as { year: number } | null)?.year ?? startYear;
      const start = year === startYear ? MACRO_HISTORY_START : `${year}-01-01`;
      const rows = parseFredMacro(series, await get(fredObservationsUrl(key, series, { start, end: `${year}-12-31` })), today(now()));
      await repo.upsertMacroObservations!(rows);
      return { cursor: { year: year + 1 }, done: year >= now().getUTCFullYear() };
    } };
}

/** Backfill of the Treasury par yield curve (3 month, 2 and 10 year), one CSV per calendar year. Source `treasury` is the ledger source. */
export function createMacroTreasuryBackfillJob(repo: Store, http: Pick<SourceHttp, "get"> = defaultHttp(), now: () => Date = () => new Date()): BackfillJob {
  return { name: "macro-treasury", source: "treasury",
    async subjects() { return ["par-yield-curve"]; },
    async step(_subject, previous) {
      const year = (previous as { year: number } | null)?.year ?? startYear;
      const rows = parseTreasuryCurve(await http.get(treasuryCurveUrl(year))).filter((row) => row.obsDate >= MACRO_HISTORY_START);
      await repo.upsertMacroObservations!(rows);
      return { cursor: { year: year + 1 }, done: year >= now().getUTCFullYear() };
    } };
}

/** Daily refresh used by the macro job. Fetches the recent window of every storable FRED series and the current Treasury year. A failing source is reported and skipped. */
export async function storeDailyMacroObservations(repository: Store, deps: { key?: string; http: Pick<SourceHttp, "get">; get?: (url: string) => Promise<string>; now: Date }): Promise<{ written: number; failures: string[] }> {
  const failures: string[] = [], put = repository.upsertMacroObservations?.bind(repository);
  if (!put) return { written: 0, failures };
  let written = 0;
  const fetchedOn = today(deps.now);
  if (deps.key) for (const series of storableFredSeries()) {
    try { written += await put(parseFredMacro(series.id, await (deps.get ?? getText)(fredObservationsUrl(deps.key, series.id, { limit: series.dailyLimit })), fetchedOn)); }
    catch (error) { failures.push(`macro ${series.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  try {
    const year = deps.now.getUTCFullYear(), since = `${year - 1}-12-01`;
    const rows: MacroObservation[] = parseTreasuryCurve(await deps.http.get(treasuryCurveUrl(year))).filter((row) => row.obsDate >= since);
    written += await put(rows);
  } catch (error) { failures.push(`treasury curve: ${error instanceof Error ? error.message : String(error)}`); }
  return { written, failures };
}

/** Backfill of the ECB reference rates (USD, CZK, GBP): one request for the whole history file. Source `ecb` is the ledger source. */
export function createMacroEcbBackfillJob(repo: Store, http: Pick<SourceHttp, "get"> = defaultHttp()): BackfillJob {
  return { name: "macro-ecb", source: "ecb",
    async subjects() { return ["euro-reference-rates"]; },
    async step() {
      await repo.upsertMacroObservations!(parseEcbFx(await http.get(ECB_HIST_URL, { timeoutMs: 30_000 })).filter((row) => row.obsDate >= MACRO_HISTORY_START));
      return { cursor: { done: true }, done: true };
    } };
}

/** Daily refresh of the ECB reference rates from the 90 day file, so a missed run is filled in by the next one. Rows already stored with the same value are skipped, so reruns add nothing. */
export async function storeDailyEcbFx(repository: Store, http: Pick<SourceHttp, "get">): Promise<{ written: number; failures: string[] }> {
  const put = repository.upsertMacroObservations?.bind(repository);
  if (!put) return { written: 0, failures: [] };
  try { return { written: await put(parseEcbFx(await http.get(ECB_HIST_90D_URL, { timeoutMs: 30_000 }))), failures: [] }; }
  catch (error) { return { written: 0, failures: [`ecb fx: ${error instanceof Error ? error.message : String(error)}`] }; }
}
