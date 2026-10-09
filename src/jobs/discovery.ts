import { writeFileSync } from "node:fs";
import pg from "pg";
import { XMLParser } from "fast-xml-parser";
import themes from "./discovery-themes.json";
import { DISCOVERY, DISCOVERY_MANAGERS } from "./discovery-config";
import { parseFeed, feedUrl } from "../collectors/sources/getcurrent";
import { getText } from "../collectors/http";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { isIsoDate } from "../db/iso-date";
import { collectFrames } from "../collectors/sources/frames";
import { collectClinicalTrials } from "../collectors/sources/clinicaltrials";
import { defaultHttp } from "../collectors/sources/client";
import { normalizeIssuer } from "../collectors/sources/thirteenf";
import { score } from "../engine/score";
import type { OHLCV } from "../engine/types";
import { SymbolNotFoundError, TwelveDataProvider } from "../data/twelvedata";
import { filingUrl } from "../collectors/edgar";
import { previousTradingDay } from "./macro";

export interface CandidateSource { kind: "edgar" | "price_volume" | "theme" | "frames" | "clinical_trial" | "ownership" | "thirteenf"; url: string; detail: string }
export interface DiscoveryCandidate { symbol: string; name: string; sector: string; theme: string | null; score: number; sources: CandidateSource[];
  growth?: { current: number; prior: number }; ruleScore?: number; ruleState?: string; signalDate?: string; benchmarkClose?: number | null }
export const weekStart = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`);
  if (!isIsoDate(date) || Number.isNaN(day.valueOf())) throw new Error("date must be YYYY-MM-DD");
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
};

/** The Atom feed omits item numbers. Confirm each accession against the issuer's submissions JSON. */
export async function edgarCandidates(get: (url: string) => Promise<string> = getText, since = "0000-01-01"): Promise<DiscoveryCandidate[]> {
  const filings = (await currentFilings("8-K", since, get)).filter((row) => row.form === "8-K" && row.issuer);
  const tickers = filings.length ? await tickerMap(get) : new Map<number, string>();
  const byCik = new Map<number, { filings: { recent: { accessionNumber: string[]; items?: string[] } } }>();
  const out: DiscoveryCandidate[] = [];
  for (const filing of filings) {
    const cik = filing.issuer!.cik;
    if (!byCik.has(cik)) byCik.set(cik, JSON.parse(await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)));
    const recent = byCik.get(cik)!.filings.recent;
    const index = recent.accessionNumber.indexOf(filing.accession);
    const items = index < 0 ? "" : recent.items?.[index] ?? "";
    const matched = items.split(/[,\s]+/).filter((item) => item === "1.01" || item === "2.02");
    if (!matched.length) continue;
    const symbol = tickers.get(cik);
    if (!symbol) continue;
    out.push({ symbol, name: filing.issuer!.name, sector: "Discovery", theme: null, score: matched.includes("1.01") ? 5 : 4,
      sources: [{ kind: "edgar", url: filing.url, detail: `8-K Item ${matched.join(", ")}` }] });
  }
  return out;
}

/** Page through the weekly feed. Reaching either cap before the date boundary fails visibly instead of dropping filings. */
export async function currentFilings(type: string, since: string, get: (url: string) => Promise<string> = getText) {
  const count = 100;
  const filings: ReturnType<typeof parseFeed> = [];
  const seen = new Set<string>();
  for (let page = 0; page < DISCOVERY.maxFeedPages; page++) {
    const body = await get(feedUrl(type, count, page * count));
    const rows = parseFeed(body);
    const entryCount = (body.match(/<entry(?:\s|>)/g) ?? []).length;
    for (const row of rows) if (row.filed >= since && !seen.has(row.accession)) { filings.push(row); seen.add(row.accession); }
    if (filings.length > DISCOVERY.maxFeedCompanies) throw new Error(`${type} weekly feed exceeded ${DISCOVERY.maxFeedCompanies} filings`);
    if (entryCount < count || rows.some((row) => row.filed < since)) return filings;
  }
  throw new Error(`${type} weekly feed exceeded ${DISCOVERY.maxFeedPages} pages`);
}

async function tickerMap(get: (url: string) => Promise<string>): Promise<Map<number, string>> {
  const rows = JSON.parse(await get("https://www.sec.gov/files/company_tickers.json")) as Record<string, { cik_str: number; ticker: string }>;
  return new Map(Object.values(rows).map((row) => [row.cik_str, row.ticker.toUpperCase()]));
}

export function themeCandidates(): DiscoveryCandidate[] {
  return themes.themes.flatMap((theme) => theme.beneficiaries.map((item) => ({ symbol: item.symbol, name: item.name, sector: item.sector,
    theme: theme.name, score: 1, sources: [{ kind: "theme" as const, url: item.sourceUrl, detail: theme.chain }] })));
}

export function frameCandidates(items: { ticker?: string | null; name: string; yoyPercent: number; priorYoyPercent: number; accelerationPp: number; revenue: number }[], url: string): DiscoveryCandidate[] {
  return items.filter((item) => item.ticker && item.revenue >= 50_000_000 && item.yoyPercent >= DISCOVERY.minRevenueGrowthPct && item.accelerationPp > 0)
    .map((item) => ({ symbol: item.ticker!.toUpperCase(), name: item.name, sector: "Growth", theme: null,
      score: Math.min(6, 3 + Math.floor(item.accelerationPp / 10)), growth: { current: item.yoyPercent, prior: item.priorYoyPercent },
      sources: [{ kind: "frames", url, detail: "SEC XBRL quarterly revenue growth and acceleration" }] }));
}

/** SEC frames covers US filers outside the tracked universe; its collector already makes a bounded, revenue-qualified ranking. */
export async function marketwideGrowthCandidates(now: Date, knownCompanies: { symbol: string; name: string }[]): Promise<DiscoveryCandidate[]> {
  const output = await collectFrames({ http: defaultHttp(), companies: knownCompanies, symbols: [], since: now.toISOString().slice(0, 10), now, env: process.env });
  const doc = output.documents.find((item) => item.meta.kind === "discovery");
  if (!doc) return [];
  return frameCandidates(doc.meta.items as Parameters<typeof frameCandidates>[0], doc.url);
}

/** Recent Phase 2/3 study updates from any sponsor, mapped conservatively to exact SEC issuer names. */
export async function biotechCandidates(since: string, now: Date, get: (url: string) => Promise<string> = getText): Promise<DiscoveryCandidate[]> {
  const rows = JSON.parse(await get("https://www.sec.gov/files/company_tickers.json")) as Record<string, { ticker: string; title: string }>;
  const byName = new Map(Object.values(rows).map((row) => [normalizeIssuer(row.title), row.ticker.toUpperCase()]));
  const output = await collectClinicalTrials({ http: defaultHttp(), companies: [], symbols: [], since, now, env: process.env });
  return output.documents.flatMap((doc) => {
    const sponsor = String(doc.meta.sponsor ?? "");
    const symbol = byName.get(normalizeIssuer(sponsor));
    return symbol ? [{ symbol, name: sponsor, sector: "Biotech", theme: "Biotech catalysts", score: 3,
      sources: [{ kind: "clinical_trial" as const, url: doc.url, detail: String(doc.meta.signal ?? "clinical trial update") }] }] : [];
  });
}

/** 13D/G ownership changes are current, public issuer filings and can surface names outside the universe. */
export async function ownershipCandidates(get: (url: string) => Promise<string> = getText, since = "0000-01-01"): Promise<DiscoveryCandidate[]> {
  const out: DiscoveryCandidate[] = [];
  const tickers = await tickerMap(get);
  for (const form of ["SCHEDULE 13D", "SCHEDULE 13G"]) {
    const filings = (await currentFilings(form, since, get)).filter((row) => row.issuer);
    for (const filing of filings) {
      const symbol = tickers.get(filing.issuer!.cik);
      if (!symbol) continue;
      out.push({ symbol, name: filing.issuer!.name, sector: "Discovery", theme: null, score: form.endsWith("13D") ? 3 : 2,
        sources: [{ kind: "ownership", url: filing.url, detail: `${filing.form} ownership filing` }] });
    }
  }
  return out;
}

export interface ManagerHolding { cusip: string; name: string; shares: number }
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, trimValues: true });
export function parse13fHoldings(body: string): ManagerHolding[] {
  const root = xml.parse(body) as { informationTable?: { infoTable?: unknown } };
  const raw = root.informationTable?.infoTable;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return entries.flatMap((entry) => {
    const item = entry as { cusip?: unknown; nameOfIssuer?: unknown; putCall?: unknown; shrsOrPrnAmt?: { sshPrnamt?: unknown; sshPrnamtType?: unknown } };
    const cusip = String(item.cusip ?? "").toUpperCase();
    const shares = Number(item.shrsOrPrnAmt?.sshPrnamt);
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !item.nameOfIssuer || item.putCall || !Number.isFinite(shares) || shares <= 0 || String(item.shrsOrPrnAmt?.sshPrnamtType ?? "SH") !== "SH") return [];
    return [{ cusip, name: String(item.nameOfIssuer), shares }];
  });
}

export function managerHoldingChanges(current: ManagerHolding[], previous: ManagerHolding[], issuerTickers: Map<string, string>, manager: string, url: string): DiscoveryCandidate[] {
  const prior = new Map(previous.map((row) => [row.cusip, row.shares]));
  return current.flatMap((row) => {
    const symbol = issuerTickers.get(normalizeIssuer(row.name));
    if (!symbol) return [];
    const before = prior.get(row.cusip) ?? 0;
    if (before && row.shares < before * 1.5) return [];
    return [{ symbol, name: row.name, sector: "Discovery", theme: null, score: before ? 1 : 2,
      sources: [{ kind: "thirteenf" as const, url, detail: `${manager} quarter-end 13F holding ${before ? "increased" : "new"}` }] }];
  });
}

/** Compare two quarterly information tables for a small manager list. The filing itself is the review source. */
export async function manager13fCandidates(get: (url: string) => Promise<string> = getText, date = new Date().toISOString().slice(0, 10), since = "0000-01-01"): Promise<DiscoveryCandidate[]> {
  const tickerRows = JSON.parse(await get("https://www.sec.gov/files/company_tickers.json")) as Record<string, { ticker: string; title: string }>;
  const names = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const row of Object.values(tickerRows)) {
    const key = normalizeIssuer(row.title);
    if (names.has(key) && names.get(key) !== row.ticker) ambiguous.add(key);
    else names.set(key, row.ticker.toUpperCase());
  }
  for (const key of ambiguous) names.delete(key);
  const result: DiscoveryCandidate[] = [];
  for (const manager of DISCOVERY_MANAGERS) {
    const submission = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${String(manager.cik).padStart(10, "0")}.json`)) as
      { filings: { recent: { form: string[]; accessionNumber: string[]; filingDate: string[] } } };
    const recent = submission.filings.recent;
    const filings = recent.form.flatMap((form, i) => form === "13F-HR" && recent.filingDate[i] <= date && /^\d{10}-\d{2}-\d{6}$/.test(recent.accessionNumber[i] ?? "")
      ? [{ accession: recent.accessionNumber[i], filed: recent.filingDate[i] }] : []).slice(0, 2);
    if (!filings.length || filings[0].filed < since) continue;
    const accessions = filings.map((filing) => filing.accession);
    if (accessions.length < 2) continue;
    const holdings: { rows: ManagerHolding[]; url: string }[] = [];
    for (const accession of accessions) {
      const base = `https://www.sec.gov/Archives/edgar/data/${manager.cik}/${accession.replaceAll("-", "")}/`;
      const index = JSON.parse(await get(`${base}index.json`)) as { directory?: { item?: { name: string; type?: string }[] } };
      const file = index.directory?.item?.find((item) => /INFORMATION TABLE/i.test(item.type ?? "") && /\.xml$/i.test(item.name));
      if (!file) break;
      const url = filingUrl(base, file.name);
      holdings.push({ rows: parse13fHoldings(await get(url)), url });
    }
    if (holdings.length === 2) result.push(...managerHoldingChanges(holdings[0].rows, holdings[1].rows, names, manager.name, holdings[0].url));
  }
  return result;
}

/** Movers come from stored tracked and discovery price bars. The source link is for private review; no third-party price figure is published. */
export async function moverCandidates(db: Pick<pg.Pool, "query">, date: string): Promise<DiscoveryCandidate[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; move_pct: number; volume_multiple: number }>(`WITH ranked AS (
    SELECT b.ticker,b.name,b.sector,b.bar_date,b.close,b.volume,
      lag(b.close,5) OVER (PARTITION BY b.ticker ORDER BY b.bar_date) AS close_5,
      avg(b.volume) OVER (PARTITION BY b.ticker ORDER BY b.bar_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS avg_volume,
      count(b.volume) OVER (PARTITION BY b.ticker ORDER BY b.bar_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS prior_count,
      row_number() OVER (PARTITION BY b.ticker ORDER BY b.bar_date DESC) AS rn
    FROM (
      SELECT p.ticker,i.name,i.sector,p.bar_date,p.close,p.volume FROM daily_bars p JOIN instruments i ON i.ticker=p.ticker
        WHERE p.bar_date <= $1::date AND i.source <> 'benchmark'
      UNION ALL
      SELECT p.symbol AS ticker,p.name,p.sector,p.bar_date,p.close,p.volume FROM discovery_price_bars p
        WHERE p.bar_date <= $1::date AND NOT EXISTS (SELECT 1 FROM instruments i WHERE i.ticker=p.symbol)
    ) b)
    SELECT ticker,name,sector,((close/NULLIF(close_5,0)-1)*100)::float8 AS move_pct,
      (volume/NULLIF(avg_volume,0))::float8 AS volume_multiple FROM ranked
    WHERE rn=1 AND close_5 IS NOT NULL AND prior_count >= 20 AND avg_volume > 0`, [date]);
  return result.rows.filter((r) => Math.abs(r.move_pct) >= DISCOVERY.priceMovePct && r.volume_multiple >= DISCOVERY.volumeMultiple)
    .map((r) => ({ symbol: r.ticker, name: r.name, sector: r.sector, theme: null, score: 2,
      sources: [{ kind: "price_volume", url: `https://www.nasdaq.com/market-activity/stocks/${r.ticker.toLowerCase()}`, detail: "Stored five-session price and volume move" }] }));
}

/** Keep a bounded private price history for names still outside instruments, so future weekly mover screens can find them. */
export async function saveDiscoveryPriceBars(db: Pick<pg.Pool, "query">, row: Pick<DiscoveryCandidate, "symbol" | "name" | "sector">, bars: OHLCV[]): Promise<void> {
  const values = bars.slice(-260).map((bar) => ({ ...bar, symbol: row.symbol, name: row.name, sector: row.sector }));
  if (!values.length) return;
  await db.query(`INSERT INTO discovery_price_bars (symbol,name,sector,bar_date,open,high,low,close,volume)
    SELECT x->>'symbol',x->>'name',x->>'sector',(x->>'date')::date,(x->>'open')::numeric,(x->>'high')::numeric,
      (x->>'low')::numeric,(x->>'close')::numeric,(x->>'volume')::numeric FROM jsonb_array_elements($1::jsonb) x
    ON CONFLICT (symbol,bar_date) DO UPDATE SET name=EXCLUDED.name,sector=EXCLUDED.sector,open=EXCLUDED.open,
      high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume`, [JSON.stringify(values)]);
}

export function rankCandidates(rows: DiscoveryCandidate[], known: Set<string>, limit: number = DISCOVERY.maxCandidatesPerWeek): DiscoveryCandidate[] {
  const grouped = new Map<string, DiscoveryCandidate>();
  for (const row of rows) {
    if (known.has(row.symbol) || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.symbol)) continue;
    const previous = grouped.get(row.symbol);
    if (previous) {
      previous.score += row.score;
      previous.sources.push(...row.sources);
      previous.theme ??= row.theme;
      previous.growth ??= row.growth;
    } else grouped.set(row.symbol, { ...row, sources: [...row.sources] });
  }
  return [...grouped.values()].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)).slice(0, limit);
}

/** SEC tickers can include a security class. Skip explicit preferred, warrant, unit and right suffixes; plain symbols remain eligible. */
export function nonCommonStockReason(symbol: string): string | null {
  if (/[.-]P(?:R)?[A-Z]?$/.test(symbol)) return "preferred-share symbol";
  if (/[.-]W(?:S|T)?$/.test(symbol) || /^[A-Z]{4}W$/.test(symbol)) return "warrant symbol";
  if (/[.-]U$/.test(symbol) || /^[A-Z]{4}U$/.test(symbol)) return "unit symbol";
  if (/[.-]R$/.test(symbol) || /^[A-Z]{4}R$/.test(symbol)) return "rights symbol";
  return null;
}

/** Drop non-common symbols before the cut so the shortlist is filled from lower-ranked real candidates. Skips are reported once per symbol. */
export function shortlistCandidates(rows: DiscoveryCandidate[], known: Set<string>, limit: number = DISCOVERY.maxCandidatesPerWeek) {
  const skipped = new Map<string, string>();
  const common = rows.filter((row) => {
    const reason = known.has(row.symbol) ? null : nonCommonStockReason(row.symbol);
    if (reason) skipped.set(row.symbol, reason);
    return !reason;
  });
  return { shortlist: rankCandidates(common, known, limit), skipped: [...skipped].map(([symbol, reason]) => ({ symbol, reason })) };
}

export async function screenCandidates(rows: DiscoveryCandidate[], date: string, barsFor: (symbol: string) => Promise<OHLCV[]>,
  macro: { growthSectorRotation: boolean | null; dataTailwind: boolean | null }, benchmarkClose: number | null | ((date: string) => Promise<number | null>)): Promise<DiscoveryCandidate[]> {
  const screened: DiscoveryCandidate[] = [];
  for (const row of rows) {
    const bars = (await barsFor(row.symbol)).filter((bar) => bar.date <= date);
    const growth = row.growth;
    const result = score({ ticker: row.symbol, bars, fundamentals: {
      revenueGrowthCurrent: growth?.current ?? null, revenueGrowthPrior: growth?.prior ?? null,
      revenueAccelerating: growth ? growth.current > growth.prior : null, revenueDeclining: growth ? growth.current < 0 : null,
      epsBeat: null, guidanceRaised: null, earningsMissAndGuidanceCut: null, productCatalyst: null,
      insiderOrInstitutionalAccumulation: null, noRevenue: growth ? false : null, memePump: null,
    }, macro });
    if (result.invalidReasons.length || result.rejectionReasons.length || result.total < 12) continue;
    const signalDate = result.asOf;
    if (!signalDate || (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${signalDate}T00:00:00Z`)) > 7 * 86400000) continue;
    const spyClose = typeof benchmarkClose === "function" ? await benchmarkClose(signalDate) : benchmarkClose;
    if (spyClose === null) continue;
    screened.push({ ...row, ruleScore: result.total, ruleState: result.state, signalDate, benchmarkClose: spyClose });
  }
  return screened.sort((a, b) => (b.ruleScore ?? 0) - (a.ruleScore ?? 0) || b.score - a.score || a.symbol.localeCompare(b.symbol));
}

export async function screenDiscoveryShortlist(rows: DiscoveryCandidate[], date: string, barsFor: (symbol: string) => Promise<OHLCV[]>,
  macro: { growthSectorRotation: boolean | null; dataTailwind: boolean | null }, benchmarkClose: number | null | ((date: string) => Promise<number | null>)) {
  const screened: DiscoveryCandidate[] = [];
  const skipped: { symbol: string; reason: string }[] = [];
  const failures: { symbol: string; reason: string }[] = [];
  for (const row of rows) {
    const reason = nonCommonStockReason(row.symbol);
    if (reason) { skipped.push({ symbol: row.symbol, reason }); continue; }
    try { screened.push(...await screenCandidates([row], date, barsFor, macro, benchmarkClose)); }
    catch (error) {
      if (error instanceof SymbolNotFoundError) { skipped.push({ symbol: row.symbol, reason: "symbol not accepted by Twelve Data" }); continue; }
      failures.push({ symbol: row.symbol, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { screened, skippedCount: skipped.length, skipped, failureCount: failures.length, failures };
}

export async function saveCandidates(db: pg.Pool, week: string, rows: DiscoveryCandidate[], max: number = DISCOVERY.maxCandidatesPerWeek): Promise<DiscoveryCandidate[]> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`discovery:${week}`]);
    const existing = await client.query<{ symbol: string }>("SELECT symbol FROM discovery_candidates WHERE week_start=$1", [week]);
    const slots = Math.max(0, max - existing.rows.length);
    const seen = new Set(existing.rows.map((r) => r.symbol));
    const selected = rows.filter((row) => !seen.has(row.symbol)).slice(0, slots);
    for (const row of selected) {
      if (row.ruleScore === undefined || !row.ruleState || !row.signalDate) throw new Error(`Candidate ${row.symbol} lacks rule screening`);
      await client.query(`INSERT INTO discovery_candidates (week_start,symbol,name,sector,theme,score,rule_score,rule_state,signal_date,benchmark_close,sources)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) ON CONFLICT DO NOTHING`,
      [week, row.symbol, row.name, row.sector, row.theme, row.score, row.ruleScore, row.ruleState, row.signalDate, row.benchmarkClose ?? null, JSON.stringify(row.sources)]);
    }
    await client.query("COMMIT");
    return selected;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** A reviewed candidate becomes a normal instrument; the gate file can be passed to extract and judge after collect/prices/daily. */
export async function reviewCandidate(db: pg.Pool, symbol: string, approve: boolean, output?: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query<{ week_start: string; name: string; sector: string; status: string }>(`SELECT week_start::text,name,sector,status FROM discovery_candidates
      WHERE symbol=$1 AND status ${approve ? "IN ('pending','approved')" : "= 'pending'"} ORDER BY week_start DESC LIMIT 1 FOR UPDATE`, [symbol]);
    if (!row.rows.length) throw new Error(`No pending candidate for ${symbol}`);
    if (approve) await client.query(`INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ($1,$2,$3,NULL,'discovery')
      ON CONFLICT (ticker) DO UPDATE SET name=EXCLUDED.name,sector=EXCLUDED.sector`, [symbol, row.rows[0].name, row.rows[0].sector]);
    if (row.rows[0].status === "pending") await client.query("UPDATE discovery_candidates SET status=$1,reviewed_at=now() WHERE week_start=$2 AND symbol=$3", [approve ? "approved" : "rejected", row.rows[0].week_start, symbol]);
    await client.query("COMMIT");
    if (approve && output) writeFileSync(output, JSON.stringify({ symbols: [symbol], reasons: { [symbol]: ["approved discovery candidate"] } }) + "\n");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const approve = arg("--approve"), reject = arg("--reject"), explicitDate = arg("--date"), date = explicitDate ?? previousTradingDay(), output = arg("--output");
  if ((approve && reject) || (output && !approve) || !isIsoDate(date)) throw new Error("Usage: discovery [--date YYYY-MM-DD] | --approve SYMBOL [--output gate.json] | --reject SYMBOL");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (approve || reject) {
      const symbol = (approve ?? reject)!.toUpperCase();
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error("Invalid symbol");
      await reviewCandidate(pool, symbol, !!approve, output);
      process.stdout.write(`${symbol}: ${approve ? "approved" : "rejected"}\n`);
      return;
    }
    requireSecUserAgent(process.env.SEC_USER_AGENT);
    const week = weekStart(explicitDate ?? new Date().toISOString().slice(0, 10));
    const known = new Set((await pool.query<{ ticker: string }>(`SELECT ticker FROM instruments WHERE source <> 'benchmark'
      UNION SELECT symbol AS ticker FROM discovery_candidates WHERE status IN ('approved','pending')`)).rows.map((r) => r.ticker));
    const previousWeek = new Date(`${week}T00:00:00Z`);
    previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
    const since = previousWeek.toISOString().slice(0, 10);
    const companies = (await pool.query<{ ticker: string; name: string }>("SELECT ticker,name FROM instruments WHERE source <> 'benchmark'")).rows.map((r) => ({ symbol: r.ticker, name: r.name }));
    const gathered = await Promise.allSettled([
      marketwideGrowthCandidates(new Date(`${date}T12:00:00Z`), companies),
      edgarCandidates(getText, since), ownershipCandidates(getText, since), manager13fCandidates(getText, date, since),
      biotechCandidates(since, new Date(`${date}T12:00:00Z`)), moverCandidates(pool, date),
    ]);
    const sources = [...themeCandidates()];
    for (const result of gathered) if (result.status === "fulfilled") sources.push(...result.value);
    else process.stderr.write(`Discovery source failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}\n`);
    const { shortlist, skipped: filtered } = shortlistCandidates(sources, known, DISCOVERY.maxScreenedPerWeek);
    if (!process.env.TWELVE_DATA_API_KEY) throw new Error("TWELVE_DATA_API_KEY is required to apply the scoring rules to discovery candidates");
    const provider = new TwelveDataProvider({ apiKey: process.env.TWELVE_DATA_API_KEY });
    const bySymbol = new Map(shortlist.map((row) => [row.symbol, row]));
    const fresh = (bars: OHLCV[]) => bars.length >= 200 && bars.at(-1) && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${bars.at(-1)!.date}T00:00:00Z`) <= 4 * 86400000;
    const stored = async (table: "daily_bars" | "discovery_price_bars", symbol: string): Promise<OHLCV[]> => {
      const column = table === "daily_bars" ? "ticker" : "symbol";
      const result = await pool.query<{ date: string; open: string; high: string; low: string; close: string; volume: string }>(
        `SELECT bar_date::text AS date,open,high,low,close,volume FROM ${table} WHERE ${column}=$1 AND bar_date <= $2::date ORDER BY bar_date`, [symbol, date]);
      return result.rows.map((row) => ({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
    };
    const barsFor = async (symbol: string): Promise<OHLCV[]> => {
      const live = await stored("daily_bars", symbol);
      if (fresh(live)) return live;
      const discovered = await stored("discovery_price_bars", symbol);
      if (fresh(discovered)) return discovered;
      const bars = await provider.bars(symbol);
      await saveDiscoveryPriceBars(pool, bySymbol.get(symbol)!, bars);
      return bars;
    };
    const macroRow = await pool.query<{ data_tailwind: boolean | null; rotation: boolean | null }>(`SELECT (data->>'dataTailwind')::boolean AS data_tailwind,
      (data->>'sectorRotationIntoGrowth')::boolean AS rotation FROM macro_findings WHERE as_of <= $1::date ORDER BY as_of DESC LIMIT 1`, [date]);
    const macro = { growthSectorRotation: macroRow.rows[0]?.rotation ?? null, dataTailwind: macroRow.rows[0]?.data_tailwind ?? null };
    const benchmarkClose = async (signalDate: string) => {
      const row = await pool.query<{ close: string }>("SELECT close FROM daily_bars WHERE ticker='SPY' AND bar_date=$1::date", [signalDate]);
      return row.rows[0] ? Number(row.rows[0].close) : null;
    };
    const result = await screenDiscoveryShortlist(shortlist, date, barsFor, macro, benchmarkClose);
    const { screened, failureCount, failures } = result;
    const skipped = [...filtered, ...result.skipped];
    const skippedCount = skipped.length;
    for (const failure of failures) process.stderr.write(`${failure.symbol}: screening failed: ${failure.reason}\n`);
    const selected = screened.sort((a, b) => (b.ruleScore ?? 0) - (a.ruleScore ?? 0) || b.score - a.score || a.symbol.localeCompare(b.symbol)).slice(0, DISCOVERY.maxCandidatesPerWeek);
    const saved = await saveCandidates(pool, week, selected);
    process.stdout.write(`${JSON.stringify({ weekStart: week, candidates: saved, skippedCount, skipped, failureCount, failures })}\n`);
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])discovery\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
