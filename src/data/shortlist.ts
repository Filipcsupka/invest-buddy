import { cache } from "react";
import type { ScoreResult } from "@/engine";
import { getPool } from "@/db/pool";
import { readEarningsSnapshots } from "@/db/catalyst-calendar";
import { displayScore } from "@/engine/display-score";
import { evidencedMaxOf } from "@/engine/relative";
import { buildShortlist, sectorConcentration, type Shortlist, type ShortlistInput, type SectorConcentration } from "@/engine/shortlist";
import { SHORTLIST_CONFIG } from "@/engine/shortlist-config";
import { applyModelLens, topNFrom, type ModelHolding, type ModelLens, type ModelPortfolio } from "@/engine/model-lens";
import { stateKey } from "@/i18n/score-text";
import { samplePortfolio } from "@/portfolio/fixture";
import type { PortfolioSnapshot } from "@/portfolio/model";
import { sectorGroup } from "@/universe/sector-groups";
import { themeOf } from "@/universe/themes";
import { canUseVendorData, isOwner, type Viewer } from "@/viewer/viewer";
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
export interface ShortlistData {
  shortlist: Shortlist; concentration: SectorConcentration; names: Record<string, string>; sample: boolean;
  /** Model portfolio lens for this viewer (S1). Null when no portfolio snapshot is stored; absent before withModelLens runs. */
  lens?: ModelLens | null;
  /** The owner sees exact model weights; everyone else sees whole percents. */
  exactWeights?: boolean;
}

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
      theme: themeFor(instrument.ticker, facts, listingSector.get(instrument.ticker) ?? null),
    };
  });
}

/** Theme of one listing from its stored facts; the listing's own sector label fills in when no facts were read (fixture mode). */
function themeFor(ticker: string, facts: ReadonlyMap<string, ListingFacts>, listingSector: string | null) {
  const row = facts.get(ticker.toUpperCase());
  return themeOf({ instrumentSector: row?.instrumentSector ?? listingSector, vendorSector: row?.vendorSector, vendorIndustry: row?.vendorIndustry }).theme;
}

/** Model portfolio holdings with theme and sector group. Pure; a symbol without stored facts uses `listingSector`, else Unknown. */
export function modelHoldings(snapshot: Pick<PortfolioSnapshot, "weights">, facts: ReadonlyMap<string, ListingFacts>, listingSector: (symbol: string) => string | null = () => null): ModelHolding[] {
  return snapshot.weights.map(({ symbol, weightPercent }) => {
    const row = facts.get(symbol.toUpperCase());
    const sectorFacts = { instrumentSector: row?.instrumentSector ?? listingSector(symbol), vendorSector: row?.vendorSector, vendorIndustry: row?.vendorIndustry };
    return { symbol, weightPercent, theme: themeOf(sectorFacts).theme, sector: sectorGroup(sectorFacts).group };
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

/** Names in the top picks block: SHORTLIST_TOP_N within the config bounds, default 6. */
export const shortlistTopN = (env: Record<string, string | undefined> = process.env): number => topNFrom(env.SHORTLIST_TOP_N);

/**
 * Model portfolio from the stored IBKR Flex snapshot (portfolio_snapshots, weights only). The owner gets the newest stored snapshot;
 * everyone else the newest published one, the same snapshot the public portfolio page shows. Read only. Null when none is stored.
 */
async function modelPortfolioUncached(audience: "owner" | "public"): Promise<ModelPortfolio | null> {
  if (process.env.DATA_MODE === "fixture") {
    const scores = await latestScores();
    const listing = new Map(scores.rows.map((row) => [row.instrument.ticker, row.instrument.sector]));
    return { asOf: samplePortfolio.asOf, holdings: modelHoldings(samplePortfolio, new Map(), (symbol) => listing.get(symbol) ?? null) };
  }
  const db = getPool();
  if (!db) return null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await db.query<{ snapshot: PortfolioSnapshot }>(audience === "owner"
      ? "SELECT snapshot FROM portfolio_snapshots ORDER BY as_of DESC LIMIT 1"
      : "SELECT snapshot FROM portfolio_snapshots WHERE publish_on <= $1 ORDER BY as_of DESC LIMIT 1", audience === "owner" ? [] : [today]);
    const snapshot = result.rows[0]?.snapshot;
    if (!snapshot?.weights?.length) return null;
    const facts = await readListingFacts(db, snapshot.weights.map((w) => w.symbol), snapshot.asOf).catch(() => new Map<string, ListingFacts>());
    return { asOf: snapshot.asOf, holdings: modelHoldings(snapshot, facts) };
  } catch { return null; }
}

export const latestModelPortfolio = cache(webCached(modelPortfolioUncached, "model-portfolio", [CACHE_TAGS.portfolio], { bypass: () => !getPool() }));

/** The shortlist with the model portfolio lens for this viewer. Without a snapshot the lens is null and the order stays. */
export async function withModelLens(data: ShortlistData, viewer: Viewer): Promise<ShortlistData> {
  const owner = isOwner(viewer) && !viewer.preview;
  const model = await latestModelPortfolio(owner ? "owner" : "public").catch(() => null);
  return { ...data, lens: applyModelLens(data.shortlist.kept, model), exactWeights: owner };
}
