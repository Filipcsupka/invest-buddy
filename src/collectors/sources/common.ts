import { DEFAULT_SYMBOL_MAP } from "../../data/twelvedata";
import type { CusipStore } from "../../db/source-collectors";
import type { SourceState } from "../../db/collectors";
import { document, type CollectedDocument } from "../types";
import type { SourceHttp } from "./client";
import { validSecUserAgent } from "../sec-user-agent";

/** Environment as the sources read it. `process.env` is assignable to this. */
export type Env = Record<string, string | undefined>;
export interface Company { symbol: string; name: string; sector?: string }
export interface SourceContext {
  http: SourceHttp;
  /** Whole universe. Sources that map by name or CIK use all of it. */
  companies: Company[];
  /** Symbols selected for this run (`--only`). */
  symbols: string[];
  since: string;
  now: Date;
  env: Env;
  cusips?: CusipStore;
  /** Stored facts and recorded API usage, for sources that plan their requests (alphavantage). */
  state?: SourceState;
}
/** Facts reference documents by URL; the runner swaps in database ids after the upsert. `expiresAt` overrides the 30-day default. */
export interface PendingFact { symbol: string; key: string; asOf: string; value: unknown; documentUrls: string[]; expiresAt?: string }
/**
 * `apiRequests`: requests sent to a metered API, recorded in collector_runs.api_requests. `failures`: per-ticker failures of a source
 * that keeps going after one ticker fails. `skipped`: why the source sent nothing (no key, cap reached).
 */
export interface SourceOutput { documents: CollectedDocument[]; facts: PendingFact[]; apiRequests?: number; failures?: { ticker: string; reason: string }[]; skipped?: string }
export interface PingResult { source: string; ok: boolean; ms: number; detail: string; skipped?: boolean }
export interface SourceModule {
  name: string;
  /** Needs SEC_USER_AGENT. */
  sec?: boolean;
  /** Missing for helpers that only support another source (OpenFIGI). */
  collect?: (ctx: SourceContext) => Promise<SourceOutput>;
  ping: (http?: SourceHttp, env?: Env) => Promise<PingResult>;
}

export interface License { license_note: string; display_allowed: boolean }
export const LICENSES = {
  sec: { display_allowed: true, license_note: "US government data from SEC EDGAR, public." },
  rss: { display_allowed: false, license_note: "GlobeNewswire feed text. Redistribution terms not checked; internal signal only." },
  openfda: { display_allowed: true, license_note: "openFDA content is public domain under CC0 1.0 (open.fda.gov/terms). Some linked data may not be public domain." },
  clinicaltrials: { display_allowed: false, license_note: "ClinicalTrials.gov (NLM). Terms text not checked; treated as not cleared for display." },
  usaspending: { display_allowed: true, license_note: "USAspending.gov, US government open data." },
  fed: { display_allowed: true, license_note: "Federal Reserve Board public data." },
  treasury: { display_allowed: true, license_note: "US Treasury FiscalData, public." },
  bls: { display_allowed: true, license_note: "US Bureau of Labor Statistics public data." },
  cboe: { display_allowed: false, license_note: "Cboe file. Redistribution terms not checked; internal signal only." },
  gnews: { display_allowed: false, license_note: "Google News feed. Feed text allows only personal, non-commercial use in a feed reader. Internal signal only." },
  gdelt: { display_allowed: false, license_note: "GDELT DOC 2.0. Terms of use not checked; internal signal only." },
  openfigi: { display_allowed: false, license_note: "OpenFIGI mapping used only to link CUSIPs to tickers; terms not checked." },
  alphavantage: { display_allowed: false, license_note: "Alpha Vantage EARNINGS. Display rights not verified; internal only. The page may show only the derived EPS beat yes/no with the source name, never the estimate." },
} satisfies Record<string, License>;

export function sourceDocument(input: Omit<CollectedDocument, "contentHash">, license: License): CollectedDocument {
  return document({ ...input, meta: { ...input.meta, license_note: license.license_note, display_allowed: license.display_allowed } });
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const daysBefore = (date: Date, days: number) => isoDate(new Date(date.getTime() - days * 86400000));
export const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
export const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function parseJson<T>(text: string, source: string): T {
  try { return JSON.parse(text.replace(/^﻿/, "")) as T; } catch { throw new Error(`${source}: response is not JSON`); }
}

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted) { if (char === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += char; }
      else if (char === '"') quoted = true;
      else if (char === ",") { cells.push(cell); cell = ""; }
      else cell += char;
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

/** Universe symbol to the ticker SEC and OpenFIGI use (SQ is XYZ). */
export const marketTicker = (symbol: string) => DEFAULT_SYMBOL_MAP[symbol] ?? symbol;

/** Search names that avoid common words. The universe name alone is wrong for these. */
const NEWS_NAMES: Record<string, string> = {
  SE: "Sea Limited", SQ: "Block Inc", NOW: "ServiceNow", NET: "Cloudflare", META: "Meta Platforms", AMD: "Advanced Micro Devices",
  GOOGL: "Alphabet Google", ROKU: "Roku", SHOP: "Shopify", SNOW: "Snowflake", UBER: "Uber Technologies",
};
export const newsName = (company: Company) => NEWS_NAMES[company.symbol] ?? company.name;

/** Runs `fn` under the ping contract: never throws, measures time, 10 s ceiling. */
export async function runPing(
  source: string,
  fn: () => Promise<string>,
  options: { sec?: boolean; env?: Env; requires?: { variable: string }; timeoutMs?: number } = {},
): Promise<PingResult> {
  const env = options.env ?? process.env;
  if (options.sec && !validSecUserAgent(env.SEC_USER_AGENT)) return { source, ok: true, skipped: true, ms: 0, detail: "skipped: SEC_USER_AGENT is missing or invalid" };
  if (options.requires && !env[options.requires.variable]) return { source, ok: true, skipped: true, ms: 0, detail: `skipped: ${options.requires.variable} is not set` };
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ping timed out")), options.timeoutMs ?? 10_000); }),
    ]);
    return { source, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return { source, ok: false, ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}
/** Request options for pings: short timeout, one attempt so a 429 fails fast. */
export const PING_REQUEST = { timeoutMs: 8000, maxAttempts: 1 } as const;
