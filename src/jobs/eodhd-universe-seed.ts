import pg from "pg";
import type { BulkLastDayBar, EodBar, Fundamentals, Split } from "../data-providers/eodhd/client";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { parseEodhdFundamentals } from "../data-providers/eodhd/fundamentals";
import { insertFundamentals, type FundamentalRow } from "../collectors/sources/companyfacts";
import { PostgresPriceRepository } from "../db/prices";
import { eodhdClassification } from "../universe/sector";
import { isCommonStock } from "../universe/select";
import { fxConversion, normalizeCurrency, UNIVERSE_CURRENCIES, UNIVERSE_EXCHANGES, type FxObservation } from "../universe/market";
import { barsFromHistory, splitActions } from "./eodhd-prices";
import { storeClassification } from "./eodhd-fundamentals";
import { runLoggedJob } from "./job-log";

export interface SeedListing { vendorSymbol: string; code: string; exchange: string; name: string; currency: string; type: string }
/** Instrument key: US names keep the bare code like every existing US instrument; other listings use the vendor symbol. */
export const seedTicker = (listing: Pick<SeedListing, "vendorSymbol" | "code" | "exchange">) => (listing.exchange === "US" ? listing.code : listing.vendorSymbol);
export interface RankedSeed extends SeedListing { tradedValue: number }
export interface SeedClient {
  eodBulkLastDay(exchange: string, options: { filter: "extended" }): Promise<BulkLastDayBar[]>;
  eod(symbol: string, options: { period: "d"; order: "a" }): Promise<EodBar[]>;
  splits(symbol: string): Promise<Split[]>;
  fundamentals(symbol: string): Promise<Fundamentals>;
  getCallCosts(): Record<string, number>;
}
export interface SeedStore {
  readySymbols(): Promise<Set<string>>;
  fxRates(asOf: string): Promise<ReadonlyMap<string, FxObservation>>;
  save(listing: SeedListing, bars: ReturnType<typeof barsFromHistory>, facts: FundamentalRow[], payload: Fundamentals, today: string): Promise<void>;
}
export interface SeedOptions { topPerExchange: number; maxCalls: number; minPrice: number; dryRun?: boolean; today?: string }

/** Use the selector's dated ECB conversion for both the USD price floor and traded-value ranking. */
export function rankSeedCandidates(listings: SeedListing[], bulk: BulkLastDayBar[], limit: number, minPrice: number,
  rates: ReadonlyMap<string, FxObservation>, asOf: string): RankedSeed[] {
  const byCode = new Map(bulk.map((row) => [row.code, row]));
  return listings.flatMap((listing) => {
    if (!isCommonStock({ ticker: listing.vendorSymbol, vendorSymbol: listing.vendorSymbol, exchange: listing.exchange,
      name: listing.name, securityType: listing.type })) return [];
    const row = byCode.get(listing.code);
    const currency = normalizeCurrency(listing.currency);
    const usdPerUnit = currency ? fxConversion(currency, rates, asOf).usdPerUnit : null;
    if (!currency || !row || typeof row.close !== "number" || !Number.isFinite(row.close) ||
      typeof row.volume !== "number" || !Number.isFinite(row.volume) || row.volume <= 0 ||
      usdPerUnit === null || row.close * usdPerUnit < minPrice) return [];
    return [{ ...listing, tradedValue: row.close * row.volume * usdPerUnit }];
  }).sort((a, b) => b.tradedValue - a.tradedValue || a.vendorSymbol.localeCompare(b.vendorSymbol)).slice(0, limit);
}

const total = (costs: Record<string, number>) => Object.values(costs).reduce((sum, cost) => sum + cost, 0);
const fatal = (error: unknown) => error instanceof EodhdHttpError && [401, 402, 403].includes(error.status);

/** Bulk prices shortlist each exchange; only its top unused names get history and fundamentals. */
export async function runUniverseSeed(client: SeedClient, store: SeedStore, listings: SeedListing[], options: SeedOptions) {
  const ready = await store.readySymbols();
  const asOf = options.today ?? new Date().toISOString().slice(0, 10);
  const rates = await store.fxRates(asOf);
  const eligible = listings.filter((row) => {
    const currency = normalizeCurrency(row.currency);
    return currency !== null && UNIVERSE_CURRENCIES.some((known) => known === currency)
      && !(row.exchange === "LSE" && currency === "GBP")
      && isCommonStock({ ticker: row.vendorSymbol, vendorSymbol: row.vendorSymbol, exchange: row.exchange,
        name: row.name, securityType: row.type });
  });
  const groups = [...new Set(eligible.map((row) => row.exchange))];
  let reserved = total(client.getCallCosts()), ranked = 0, saved = 0, failures = 0, skippedReady = 0;
  let stoppedReason: string | null = null;
  const canCall = (cost: number) => Math.max(reserved, total(client.getCallCosts())) + cost <= options.maxCalls;
  const used = (cost: number) => { reserved = Math.max(reserved + cost, total(client.getCallCosts())); };
  for (const exchange of groups) {
    const pending = eligible.filter((row) => row.exchange === exchange && !ready.has(row.vendorSymbol));
    skippedReady += eligible.filter((row) => row.exchange === exchange).length - pending.length;
    if (!pending.length) continue;
    if (!canCall(100)) { stoppedReason = "call_budget"; break; }
    let bulk: BulkLastDayBar[];
    try { bulk = await client.eodBulkLastDay(exchange, { filter: "extended" }); }
    catch (error) {
      used(100); failures++;
      if (fatal(error)) { stoppedReason = `vendor_http_${(error as EodhdHttpError).status}`; break; }
      continue;
    }
    used(100);
    if (!Array.isArray(bulk) || !bulk.length) { failures++; continue; }
    const choices = rankSeedCandidates(pending, bulk, options.topPerExchange, options.minPrice, rates, asOf);
    ranked += choices.length;
    for (const listing of choices) {
      if (options.dryRun) continue;
      if (!canCall(12)) { stoppedReason = "call_budget"; break; }
      try {
        const history = await client.eod(listing.vendorSymbol, { period: "d", order: "a" });
        used(1);
        const splits = await client.splits(listing.vendorSymbol);
        used(1);
        const payload = await client.fundamentals(listing.vendorSymbol);
        used(10);
        const actions = splitActions(listing.vendorSymbol, splits as Split[]);
        const bars = barsFromHistory(history as EodBar[], actions);
        const facts = parseEodhdFundamentals(payload, seedTicker(listing), options.today ?? new Date().toISOString().slice(0, 10)).rows;
        if (!facts.length) { failures++; continue; }
        await store.save(listing, bars, facts, payload, options.today ?? new Date().toISOString().slice(0, 10));
        saved++;
        ready.add(listing.vendorSymbol);
      } catch (error) {
        reserved = Math.max(reserved, total(client.getCallCosts()));
        failures++;
        process.stderr.write(`${JSON.stringify({ event: "eodhd_universe_seed_symbol_failed", symbol: listing.vendorSymbol,
          reason: error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error" })}\n`);
        if (fatal(error)) { stoppedReason = `vendor_http_${(error as EodhdHttpError).status}`; break; }
      }
    }
    if (stoppedReason) break;
  }
  return { exchanges: groups.length, ranked, saved, skippedReady, failures, estimatedCalls: Math.max(reserved, total(client.getCallCosts())), stoppedReason,
    dryRun: Boolean(options.dryRun) };
}

export class PgSeedStore implements SeedStore {
  constructor(private readonly db: pg.Pool) {}
  async fxRates(asOf: string): Promise<ReadonlyMap<string, FxObservation>> {
    const result = await this.db.query<{ series_id: string; obs_date: string; value: string }>(
      `SELECT DISTINCT ON (series_id) series_id,obs_date::text,value::text FROM macro_observations
       WHERE source_id='ecb' AND obs_date<=$1::date AND realtime_start<=$1::date
         AND (observed_at AT TIME ZONE 'UTC')::date<=$1::date
       ORDER BY series_id,obs_date DESC,realtime_start DESC`, [asOf]);
    return new Map(result.rows.map((row) => [row.series_id, { date: row.obs_date, value: Number(row.value) }]));
  }
  async readySymbols() {
    const rows = await this.db.query<{ vendor_symbol: string }>("SELECT vendor_symbol FROM eodhd_universe_seed WHERE seeded_at > now() - interval '30 days'");
    return new Set(rows.rows.map((row) => row.vendor_symbol));
  }
  async save(listing: SeedListing, bars: ReturnType<typeof barsFromHistory>, facts: FundamentalRow[], payload: Fundamentals, today: string) {
    const ticker = seedTicker(listing);
    await this.db.query(`INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ($1,$2,'Unclassified',NULL,'discovery')
      ON CONFLICT (ticker) DO NOTHING`, [ticker, listing.name]);
    const prices = new PostgresPriceRepository(this.db);
    await prices.upsertBars(ticker, bars, { sourceId: "eodhd", vendorSymbol: listing.vendorSymbol, currency: normalizeCurrency(listing.currency) });
    await insertFundamentals(this.db, facts, "eodhd");
    await storeClassification(this.db, listing.vendorSymbol, eodhdClassification(payload.General), today);
    await this.db.query(`INSERT INTO eodhd_universe_seed (vendor_symbol,last_bar_date,bar_count,fact_count)
      VALUES ($1,$2,$3,$4) ON CONFLICT (vendor_symbol) DO UPDATE SET seeded_at=now(),last_bar_date=EXCLUDED.last_bar_date,
        bar_count=EXCLUDED.bar_count,fact_count=EXCLUDED.fact_count`, [listing.vendorSymbol, bars.at(-1)!.date, bars.length, facts.length]);
  }
}

export function parseSeedArgs(args: string[]) {
  const out: SeedOptions & { exchanges?: string[] } = { topPerExchange: 75, maxCalls: 19_000, minPrice: 5, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--dry-run") out.dryRun = true;
    else if (flag === "--top-per-exchange" || flag === "--max-calls" || flag === "--min-price") {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value <= 0 || (flag !== "--min-price" && !Number.isInteger(value))) throw new Error(`Invalid ${flag}`);
      if (flag === "--top-per-exchange") out.topPerExchange = value;
      if (flag === "--max-calls") out.maxCalls = value;
      if (flag === "--min-price") out.minPrice = value;
    } else if (flag === "--exchanges") {
      out.exchanges = args[++i]?.split(",").map((x) => x.trim().toUpperCase());
      if (!out.exchanges?.length || out.exchanges.some((x) => !UNIVERSE_EXCHANGES.some((known) => known === x))) throw new Error("Invalid --exchanges");
    } else throw new Error(`Unknown seed option ${flag}`);
  }
  if (out.topPerExchange > 500 || out.maxCalls > 20_000) throw new Error("Seed limits exceed the per-run bounds");
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.EODHD_API_KEY) throw new Error("DATABASE_URL and EODHD_API_KEY are required");
  const options = parseSeedArgs(process.argv.slice(2));
  // US runs only when named: US listings must be USA-domiciled and not already an instrument (members keep their own collectors).
  const exchanges = options.exchanges ?? UNIVERSE_EXCHANGES.filter((row) => row !== "US");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await db.query<{ vendor_symbol: string; code: string; exchange: string; name: string; currency: string; type: string }>(
      `SELECT vendor_symbol,code,exchange,name,currency,type FROM symbols WHERE NOT delisted AND exchange=ANY($1::text[])
       AND currency IS NOT NULL AND type IS NOT NULL
       AND (exchange<>'US' OR (country='USA' AND NOT EXISTS (SELECT 1 FROM instruments i WHERE i.ticker=symbols.code)))
       ORDER BY exchange,vendor_symbol`, [exchanges]);
    const listings = result.rows.map((row) => ({ vendorSymbol: row.vendor_symbol, code: row.code, exchange: row.exchange,
      name: row.name, currency: row.currency, type: row.type }));
    const counts = await runUniverseSeed(new EodhdClient({ maxRetries: 0 }), new PgSeedStore(db), listings, options);
    if (counts.stoppedReason?.startsWith("vendor_http_")) process.exitCode = 1;
    return counts;
  } finally { await db.end(); }
}

if (/(?:^|[/\\])eodhd-universe-seed\.(?:ts|js)$/.test(process.argv[1] ?? ""))
  void runLoggedJob("eodhd-universe-seed", main, process.argv.includes("--dry-run") ? { store: null } : {});
