import { cache } from "react";
import type { ScoreResult } from "@/engine";
import { getPool } from "@/db/pool";
import { readEarningsSnapshots } from "@/db/catalyst-calendar";
import { displayScore } from "@/engine/display-score";
import { evidencedMaxOf } from "@/engine/relative";
import { buildShortlist, sectorConcentration, type Shortlist, type ShortlistInput, type SectorConcentration } from "@/engine/shortlist";
import { SHORTLIST_CONFIG } from "@/engine/shortlist-config";
import { stateKey } from "@/i18n/score-text";
import { canUseVendorData, type Viewer } from "@/viewer/viewer";
import { nextEarnings } from "./catalyst-calendar";
import { readListingFacts, sectorGroupsFor, type ListingFacts } from "./shortlist-sectors";
import { latestScores, type StoreRow } from "./store";
import { CACHE_TAGS, webCached } from "./web-cache";

/** SHORTLIST_VIEW: "on" or "off", default on. Same parsing as src/config/flags.ts. */
export const shortlistViewEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.SHORTLIST_VIEW !== "off";

/**
 * Who sees the shortlist. It is built from vendor-backed data, so the gate is `canUseVendorData`: the owner and customers with an
 * active Plus or trial plan get it. Everyone else, including anonymous visitors while PAYWALL is off, gets the lock card and the
 * loader is not called. With SHORTLIST_VIEW off nobody sees it.
 */
export function shortlistAccess(viewer: Viewer, env: Record<string, string | undefined> = process.env): "full" | "locked" | "hidden" {
  if (!shortlistViewEnabled(env)) return "hidden";
  return canUseVendorData(viewer, env) ? "full" : "locked";
}

export interface EarningsFact { reportDate: string | null; stale: boolean }
export interface ShortlistData { shortlist: Shortlist; concentration: SectorConcentration; names: Record<string, string>; sample: boolean }

/** Points with data out of 25: the stored value, else computed from the rule hits, else null. */
export function evidencedPoints(result: Pick<ScoreResult, "evidencedMax" | "ruleHits">): number | null {
  if (typeof result.evidencedMax === "number" && Number.isFinite(result.evidencedMax)) return result.evidencedMax;
  return result.ruleHits?.length ? evidencedMaxOf(result.ruleHits) : null;
}

/**
 * Quote currency for the traded value. A stored symbols currency wins. Without one, a plain ticker (no exchange suffix) is a US listing
 * as everywhere else in the scanner; a suffixed ticker stays unknown so its liquidity is not assessed.
 */
export function quoteCurrency(ticker: string, facts: Pick<ListingFacts, "currency"> | undefined): string | null {
  const stored = facts?.currency?.trim();
  if (stored) return stored.toUpperCase();
  return ticker.includes(".") ? null : "USD";
}

/** Shortlist inputs from stored rows of one score date. Pure; the caller supplies the classification and earnings facts. */
export function shortlistInputs(rows: readonly StoreRow[], asOf: string, facts: ReadonlyMap<string, ListingFacts>, earnings: ReadonlyMap<string, EarningsFact>): ShortlistInput[] {
  const day = rows.filter((row) => row.result.asOf.slice(0, 10) === asOf);
  const listingSector = new Map(day.map((row) => [row.instrument.ticker, row.instrument.sector]));
  const sectors = sectorGroupsFor([...listingSector.keys()], facts, (ticker) => listingSector.get(ticker) ?? null);
  return day.map(({ instrument, result }) => {
    const display = displayScore(stateKey(result.state), result.ruleHits ?? []);
    const report = earnings.get(instrument.ticker);
    return {
      ticker: instrument.ticker, displayState: display.state, percent: display.percent, evidencedPoints: evidencedPoints(result),
      bars: result.inputs?.bars ?? [], currency: quoteCurrency(instrument.ticker, facts.get(instrument.ticker)),
      reportDate: report?.reportDate ?? null, reportStale: report?.stale ?? false,
      sector: sectors.get(instrument.ticker)?.group ?? "Unknown",
    };
  });
}

/** Next report per ticker from the stored earnings calendar (read only). Missing or failed reads leave every date unknown. */
async function readEarnings(asOf: string, tickers: string[]): Promise<Map<string, EarningsFact>> {
  const db = getPool();
  if (!db || !tickers.length) return new Map();
  try {
    const { rows, latestPull } = await readEarningsSnapshots(db, asOf, tickers);
    return new Map(nextEarnings(rows, asOf, { latestPull }).map((next) => [next.ticker, { reportDate: next.reportDate, stale: next.stale }]));
  } catch { return new Map(); }
}

async function readFacts(asOf: string, tickers: string[]): Promise<Map<string, ListingFacts>> {
  const db = getPool();
  if (!db || !tickers.length) return new Map();
  try { return await readListingFacts(db, tickers, asOf); } catch { return new Map(); }
}

/**
 * Today's shortlist from the latest stored scores (the listing read, which keeps 64 bars per name). Only rows of the newest score date
 * take part. Read only. Null when no score is stored.
 */
async function latestShortlistUncached(): Promise<ShortlistData | null> {
  const data = await latestScores();
  const asOf = data.lastUpdated?.slice(0, 10);
  if (!asOf || !data.rows.length) return null;
  const tickers = data.rows.filter((row) => row.result.asOf.slice(0, 10) === asOf).map((row) => row.instrument.ticker);
  const fixture = process.env.DATA_MODE === "fixture";
  const [facts, earnings] = fixture ? [new Map<string, ListingFacts>(), new Map<string, EarningsFact>()] : await Promise.all([readFacts(asOf, tickers), readEarnings(asOf, tickers)]);
  const shortlist = buildShortlist(asOf, shortlistInputs(data.rows, asOf, facts, earnings), SHORTLIST_CONFIG);
  const listed = new Set([...shortlist.kept, ...shortlist.dropped].map((row) => row.ticker));
  const names = Object.fromEntries(data.rows.filter((row) => listed.has(row.instrument.ticker)).map((row) => [row.instrument.ticker, row.instrument.name]));
  return { shortlist, concentration: sectorConcentration(shortlist.kept, SHORTLIST_CONFIG), names, sample: data.sample };
}

export const latestShortlist = cache(webCached(latestShortlistUncached, "latest-shortlist", [CACHE_TAGS.scores], { bypass: () => !getPool() }));
