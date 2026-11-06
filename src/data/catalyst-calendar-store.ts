import { flags } from "../config/flags";
import { readEarningsSnapshots } from "../db/catalyst-calendar";
import { getPool } from "../db/pool";
import { nextEarnings, type EarningsTime } from "./catalyst-calendar";
import { CACHE_TAGS, webCached } from "./web-cache";

/** The next report date for the public calendar: the date and the time of day only, never an estimate or a fiscal period. */
export interface PublicEarningsDate { date: string; timeOfDay: EarningsTime | null }

async function loadUncached(ticker: string, today: string): Promise<PublicEarningsDate | null> {
  if (process.env.DATA_MODE === "fixture") return null;
  const db = getPool();
  if (!db) return null;
  try {
    const { rows, latestPull } = await readEarningsSnapshots(db, today, [ticker]);
    // A stale date (the newest pull no longer lists the ticker, or the pull is old) may have moved, so it is left out.
    const next = nextEarnings(rows, today, { latestPull }).find((e) => e.ticker === ticker && !e.stale);
    return next ? { date: next.reportDate, timeOfDay: next.timeOfDay } : null;
  } catch {
    // The calendar is extra. A failed read leaves the earnings row out.
    return null;
  }
}

const cached = webCached(loadUncached, "public-earnings-date", [CACHE_TAGS.scores], { bypass: () => !getPool() });

/**
 * Next earnings date for the public company page, from the stored Alpha Vantage calendar. Null unless PUBLIC_EARNINGS_DATES is on:
 * Alpha Vantage display rights are not verified (src/data/sources-registry.ts). The flag is checked before the cache, so no read happens while it is off.
 */
export async function publicEarningsDate(ticker: string, today: string, env: Record<string, string | undefined> = process.env): Promise<PublicEarningsDate | null> {
  if (!flags(env).PUBLIC_EARNINGS_DATES) return null;
  return cached(ticker, today);
}
