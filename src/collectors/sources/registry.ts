import type { CollectorRepository, CollectorRun } from "../../db/collectors";
import type { UsageLedger } from "../../data/usage";
import type { CusipStore } from "../../db/source-collectors";
import { RateLimitLockout } from "../http";
import { EXTRA_SOURCES, type SourceName } from "../types";
import * as alphavantage from "./alphavantage";
import * as bls from "./bls";
import { defaultHttp, type SourceHttp } from "./client";
import * as clinicaltrials from "./clinicaltrials";
import type { Company, Env, PingResult, SourceContext, SourceModule } from "./common";
import * as fed from "./fed";
import * as frames from "./frames";
import * as gdelt from "./gdelt";
import * as getcurrent from "./getcurrent";
import * as gnews from "./gnews";
import * as legacy from "./legacy";
import * as openfda from "./openfda";
import * as openfigi from "./openfigi";
import * as thirteenf from "./thirteenf";
import * as treasury from "./treasury";
import * as usaspending from "./usaspending";
import * as vix from "./vix";

/** Order is the ping order and the run order. Sources on one host are spread out by the client, not here. */
export const SOURCES: (Omit<SourceModule, "name"> & { name: SourceName | "openfigi" })[] = [
  { name: "edgar", sec: true, ping: legacy.pingEdgar },
  { name: "rss", ping: legacy.pingRss },
  { name: "fred", ping: legacy.pingFred },
  { name: "frames", sec: true, collect: frames.collectFrames, ping: frames.ping },
  { name: "getcurrent", sec: true, collect: getcurrent.collectGetcurrent, ping: getcurrent.ping },
  { name: "13f", sec: true, collect: thirteenf.collect13f, ping: thirteenf.ping },
  { name: "openfigi", ping: openfigi.ping },
  { name: "openfda", collect: openfda.collectOpenfda, ping: openfda.ping },
  { name: "clinicaltrials", collect: clinicaltrials.collectClinicalTrials, ping: clinicaltrials.ping },
  { name: "usaspending", collect: usaspending.collectUsaspending, ping: usaspending.ping },
  { name: "fed", collect: fed.collectFed, ping: fed.ping },
  { name: "treasury", collect: treasury.collectTreasury, ping: treasury.ping },
  { name: "bls", collect: bls.collectBls, ping: bls.ping },
  { name: "vix", collect: vix.collectVix, ping: vix.ping },
  { name: "gnews", collect: gnews.collectGnews, ping: gnews.ping },
  { name: "gdelt", collect: gdelt.collectGdelt, ping: gdelt.ping },
  { name: "alphavantage", collect: alphavantage.collectAlphaVantage, ping: alphavantage.ping },
];
export const PING_NAMES = SOURCES.map((source) => source.name);

export interface ExtraOptions { since: string; now: Date; dryRun?: boolean; http?: SourceHttp; cusips?: CusipStore; companies: Company[]; symbols: string[]; env?: Env; usage?: UsageLedger }

/**
 * Runs the sources that are not phase A collectors. One failing source does not stop the others, except that a 429 lockout
 * on a SEC source skips the remaining SEC sources. Each source is one "ticker" in the run's failure list, plus the per-ticker
 * failures a source reports itself. Metered requests (`apiRequests`) are recorded even on a dry run, so a dry run counts against a daily cap.
 */
export async function runExtraSources(repository: CollectorRepository, names: SourceName[], options: ExtraOptions) {
  const run: CollectorRun = { startedAt: options.now.toISOString(), sources: names, requested: names.length, succeeded: 0, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null, apiRequests: {} };
  const ctx: SourceContext = { http: options.http ?? defaultHttp(), companies: options.companies, symbols: options.symbols, since: options.since, now: options.now, env: options.env ?? process.env, cusips: options.cusips, state: repository, usage: options.usage };
  const universe = new Set(options.companies.map((company) => company.symbol));
  let documentsParsed = 0, factsComputed = 0, secLocked = false;
  for (const name of names) {
    const source = SOURCES.find((item) => item.name === name);
    if (!source?.collect) { run.failures.push({ ticker: name, reason: "unknown source" }); continue; }
    if (secLocked && source.sec) { run.failures.push({ ticker: name, reason: "not fetched: SEC rate-limit lockout" }); continue; }
    try {
      const output = await source.collect(ctx);
      if (output.apiRequests) run.apiRequests![name] = (run.apiRequests![name] ?? 0) + output.apiRequests;
      if (output.failures) run.failures.push(...output.failures);
      if (output.skipped) process.stderr.write(`${name}: skipped, ${output.skipped}\n`);
      documentsParsed += output.documents.length;
      const ids = new Map<string, number>();
      const facts = output.facts.filter((fact) => universe.has(fact.symbol));
      factsComputed += facts.length;
      if (!options.dryRun) {
        for (const doc of output.documents) {
          const stored = await repository.upsertDocument(doc);
          ids.set(doc.url, stored.id);
          if (stored.written) run.documentsWritten++;
        }
        for (const event of output.holderEvents ?? []) await repository.upsertHolderEvent?.(event);
        for (const fact of facts) {
          const documentIds = fact.documentUrls.map((url) => ids.get(url)).filter((id): id is number => id !== undefined);
          if (await repository.upsertFact({ symbol: fact.symbol, key: fact.key, asOf: fact.asOf, value: fact.value, documentIds, ...(fact.expiresAt ? { expiresAt: fact.expiresAt } : {}) })) run.factsWritten++;
        }
      }
      run.succeeded++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      run.failures.push({ ticker: name, reason });
      if (error instanceof RateLimitLockout && source.sec) { secLocked = true; run.stoppedReason = reason; }
    }
  }
  if (!options.dryRun || Object.keys(run.apiRequests!).length) await repository.recordRun(run);
  return { ...run, documentsParsed, factsComputed, exitCode: run.failures.length ? 1 : 0 };
}

/** Pings sources one at a time so a host's spacing is respected. Writes nothing. */
export async function runPings(names: string[] | undefined, http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult[]> {
  const selected = SOURCES.filter((source) => !names || names.includes(source.name));
  const results: PingResult[] = [];
  for (const source of selected) results.push(await source.ping(http, env));
  return results;
}

export function formatPings(results: PingResult[]): string {
  const rows = results.map((result) => [result.source, result.skipped ? "SKIP" : result.ok ? "OK" : "FAIL", String(result.ms), result.detail]);
  const header = ["SOURCE", "STATUS", "MS", "DETAIL"];
  const widths = header.map((_, i) => Math.max(header[i].length, ...rows.map((row) => row[i].length)));
  const fit = (row: string[]) => row.map((cell, i) => i === header.length - 1 ? cell : cell.padEnd(widths[i])).join("  ");
  return [fit(header), ...rows.map(fit)].join("\n");
}

export const isExtra = (name: string): name is SourceName => (EXTRA_SOURCES as readonly string[]).includes(name);
