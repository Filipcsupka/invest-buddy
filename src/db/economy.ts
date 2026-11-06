import type pg from "pg";
import { canDisplay } from "../data/sources-registry";
import { getPool } from "./pool";
import { isoDay, num, record, text, type Parsed } from "./economy-vendor";

type Query = Pick<pg.Pool, "query">;

export type UstCurve = "bill" | "long-term" | "yield" | "real-yield";
export const UST_CURVES: readonly UstCurve[] = ["yield", "real-yield", "bill", "long-term"];

export interface EconomicEventRow {
  key: string; country: string; type: string; comparison: string | null; period: string | null; eventAt: string;
  actual: number | null; previous: number | null; estimate: number | null; change: number | null; changePct: number | null;
}
export interface UstRateRow { curve: UstCurve; date: string; tenor: string; rate: number | null; raw: Record<string, unknown> }
export interface MacroIndicatorRow { country: string; indicator: string; date: string; value: number | null; countryName: string | null; indicatorName: string | null }

/** "2026-11-20 18:00:00" (no zone, read as UTC) or a bare day. */
function vendorTime(value: unknown): string | null {
  const raw = text(value);
  const day = isoDay(raw);
  if (!raw || !day) return null;
  const time = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!time) return raw.length === 10 ? `${day}T00:00:00.000Z` : null;
  const [h, m, s] = [Number(time[1]), Number(time[2]), Number(time[3] ?? 0)];
  if (h > 23 || m > 59 || s > 59) return null;
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m, s)).toISOString();
}

/** economic-events rows. Type, a two-letter country and a date are required. Before a release the vendor sends change 0, so change is kept only with an actual. */
export function parseEconomicEvents(payload: unknown): Parsed<EconomicEventRow> {
  if (!Array.isArray(payload)) return { rows: [], skipped: 1 };
  const rows: EconomicEventRow[] = [];
  const keys = new Set<string>();
  let skipped = 0;
  for (const item of payload) {
    const row = record(item);
    const type = text(row?.type);
    const country = text(row?.country)?.toUpperCase() ?? null;
    const eventAt = vendorTime(row?.date);
    if (!row || !type || !country || !/^[A-Z]{2}$/.test(country) || !eventAt) { skipped++; continue; }
    const comparison = text(row.comparison), period = text(row.period);
    const key = [country, type, comparison ?? "", period ?? "", eventAt].join("|");
    if (keys.has(key)) continue;
    keys.add(key);
    const actual = num(row.actual);
    rows.push({ key, country, type, comparison, period, eventAt, actual, previous: num(row.previous), estimate: num(row.estimate),
      change: actual === null ? null : num(row.change), changePct: actual === null ? null : num(row.change_percentage) });
  }
  return { rows, skipped };
}

/** UST pages: `{ meta, data, links }`. Long-term rows name the series in rate_type; bill rows carry the coupon-equivalent rate in coupon. */
export function parseUstRates(curve: UstCurve, payload: unknown): Parsed<UstRateRow> {
  const data = record(payload)?.data;
  if (!Array.isArray(data)) return { rows: [], skipped: 1 };
  const rows: UstRateRow[] = [];
  let skipped = 0;
  for (const item of data) {
    const row = record(item);
    const date = isoDay(row?.date);
    const tenor = text(curve === "long-term" ? row?.rate_type : row?.tenor);
    const rate = num(curve === "bill" ? row?.coupon : row?.rate);
    if (!row || !date || !tenor || rate === null) { skipped++; continue; }
    rows.push({ curve, date, tenor, rate, raw: row });
  }
  return { rows, skipped };
}

/** macro-indicator rows. The live response used CountryCode, Date and Value; lower-case names are read too. A null value is a real gap and is kept. */
export function parseMacroIndicator(country: string, indicator: string, payload: unknown): Parsed<MacroIndicatorRow> {
  if (!Array.isArray(payload)) return { rows: [], skipped: 1 };
  const rows: MacroIndicatorRow[] = [];
  let skipped = 0;
  for (const item of payload) {
    const row = record(item);
    const date = isoDay(row?.Date ?? row?.date);
    if (!row || !date) { skipped++; continue; }
    rows.push({ country: (text(row.CountryCode) ?? country).toUpperCase(), indicator, date, value: num(row.Value ?? row.value),
      countryName: text(row.CountryName), indicatorName: text(row.Indicator) });
  }
  return { rows, skipped };
}

/**
 * Stores one country's events for the window it was read for. Rows of that country in the window that the response no longer lists are removed,
 * so a moved release leaves no stale row. Pass prune=false for a truncated response; never call it with an empty one. Pass a dedicated client: it runs in one transaction.
 */
export async function replaceEconomicEvents(db: Pick<pg.ClientBase, "query">, country: string, from: string, to: string, rows: EconomicEventRow[], prune = true): Promise<{ written: number; removed: number }> {
  const own = rows.filter((row) => row.country === country);
  if (!own.length) throw new Error(`economic_events: no ${country} rows to store`);
  await db.query("BEGIN");
  try {
    const removed = !prune ? { rowCount: 0 } : await db.query(`DELETE FROM economic_events WHERE country=$1 AND event_at >= ($2::date)::timestamp AT TIME ZONE 'UTC' AND event_at < ($3::date + 1)::timestamp AT TIME ZONE 'UTC'
      AND NOT (event_key = ANY($4::text[]))`, [country, from, to, own.map((row) => row.key)]);
    const written = await db.query(`INSERT INTO economic_events (event_key,country,event_type,comparison,period,event_at,actual,previous,estimate,change,change_pct,display_allowed)
      SELECT v.k,v.c,v.t,v.cmp,v.p,v.at,v.a,v.prev,v.est,v.ch,v.chp,$12
      FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::timestamptz[],$7::numeric[],$8::numeric[],$9::numeric[],$10::numeric[],$11::numeric[])
        AS v(k,c,t,cmp,p,at,a,prev,est,ch,chp)
      ON CONFLICT (event_key) DO UPDATE SET actual=EXCLUDED.actual, previous=EXCLUDED.previous, estimate=EXCLUDED.estimate, change=EXCLUDED.change,
        change_pct=EXCLUDED.change_pct, display_allowed=EXCLUDED.display_allowed, updated_at=now()
      WHERE (economic_events.actual,economic_events.previous,economic_events.estimate,economic_events.change,economic_events.change_pct,economic_events.display_allowed)
        IS DISTINCT FROM (EXCLUDED.actual,EXCLUDED.previous,EXCLUDED.estimate,EXCLUDED.change,EXCLUDED.change_pct,EXCLUDED.display_allowed)`,
    [own.map((r) => r.key), own.map((r) => r.country), own.map((r) => r.type), own.map((r) => r.comparison), own.map((r) => r.period), own.map((r) => r.eventAt),
      own.map((r) => r.actual), own.map((r) => r.previous), own.map((r) => r.estimate), own.map((r) => r.change), own.map((r) => r.changePct), canDisplay("eodhd")]);
    await db.query("COMMIT");
    return { written: written.rowCount ?? 0, removed: removed.rowCount ?? 0 };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function upsertUstRates(db: Query, rows: UstRateRow[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO ust_rates (curve,obs_date,tenor,rate,raw,display_allowed)
    SELECT v.curve,v.d,v.tenor,v.rate,v.raw::jsonb,$6 FROM unnest($1::text[],$2::date[],$3::text[],$4::numeric[],$5::text[]) AS v(curve,d,tenor,rate,raw)
    ON CONFLICT (curve,obs_date,tenor) DO UPDATE SET rate=EXCLUDED.rate, raw=EXCLUDED.raw, display_allowed=EXCLUDED.display_allowed, fetched_at=now()
    WHERE (ust_rates.rate,ust_rates.raw,ust_rates.display_allowed) IS DISTINCT FROM (EXCLUDED.rate,EXCLUDED.raw,EXCLUDED.display_allowed)`,
  [rows.map((r) => r.curve), rows.map((r) => r.date), rows.map((r) => r.tenor), rows.map((r) => r.rate), rows.map((r) => JSON.stringify(r.raw)), canDisplay("eodhd")]);
  return result.rowCount ?? 0;
}

export async function upsertMacroIndicators(db: Query, rows: MacroIndicatorRow[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO macro_indicators (country,indicator,obs_date,value,country_name,indicator_name,display_allowed)
    SELECT v.c,v.i,v.d,v.val,v.cn,v.iname,$7 FROM unnest($1::text[],$2::text[],$3::date[],$4::numeric[],$5::text[],$6::text[]) AS v(c,i,d,val,cn,iname)
    ON CONFLICT (country,indicator,obs_date) DO UPDATE SET value=EXCLUDED.value, country_name=EXCLUDED.country_name, indicator_name=EXCLUDED.indicator_name,
      display_allowed=EXCLUDED.display_allowed, fetched_at=now()`,
  [rows.map((r) => r.country), rows.map((r) => r.indicator), rows.map((r) => r.date), rows.map((r) => r.value), rows.map((r) => r.countryName), rows.map((r) => r.indicatorName), canDisplay("eodhd")]);
  return result.rowCount ?? 0;
}

/** Newest fetch time per country|indicator pair, so a monthly series is not requested again before it is due. */
export async function indicatorFetchedAt(db: Query): Promise<Map<string, string>> {
  const result = await db.query<{ key: string; fetched: string }>(
    "SELECT country || '|' || indicator AS key, max(fetched_at)::text AS fetched FROM macro_indicators GROUP BY country, indicator");
  return new Map(result.rows.map((row) => [row.key, row.fetched]));
}

// Read models for /economy. Every query is bounded.

export interface RatePoint { tenor: string; rate: number; source: "eodhd" | "treasury" }
export interface CurveSnapshot { date: string; points: RatePoint[] }
export interface CurveView { latest: CurveSnapshot | null; weekAgo: CurveSnapshot | null; monthAgo: CurveSnapshot | null }

/** Months to maturity for a tenor label such as 4WK, 1.5M, 2Y. Unknown labels sort last. */
export function tenorMonths(tenor: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(WK|W|M|MO|Y|YR)$/i.exec(tenor.trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1]), unit = m[2].toUpperCase();
  return unit.startsWith("W") ? n * 12 / 52 : unit.startsWith("M") ? n : n * 12;
}
export const byTenor = (a: { tenor: string }, b: { tenor: string }) => tenorMonths(a.tenor) - tenorMonths(b.tenor) || a.tenor.localeCompare(b.tenor);

/** Display-cleared Treasury par yields stored by the macro job (macro_observations), by EODHD tenor. */
export const TREASURY_TENORS: Readonly<Record<string, string>> = { "3M": "TSY_3M", "2Y": "TSY_2Y", "10Y": "TSY_10Y" };

/**
 * The latest stored curve and the curves about one week and one month earlier. For the yield curve, a tenor that the
 * display-cleared Treasury series covers on the same day takes the Treasury value; EODHD fills the other tenors.
 */
export async function ustCurve(curve: UstCurve, db: Query | null = getPool()): Promise<CurveView> {
  const empty: CurveView = { latest: null, weekAgo: null, monthAgo: null };
  if (!db) return empty;
  const result = await db.query<{ date: string; tenor: string; rate: number; slot: string }>(`
    WITH latest AS (SELECT max(obs_date) AS d FROM ust_rates WHERE curve=$1),
    slots AS (
      SELECT 'latest' AS slot, (SELECT d FROM latest) AS d
      UNION ALL SELECT 'week', (SELECT max(obs_date) FROM ust_rates WHERE curve=$1 AND obs_date <= (SELECT d FROM latest) - 7)
      UNION ALL SELECT 'month', (SELECT max(obs_date) FROM ust_rates WHERE curve=$1 AND obs_date <= (SELECT d FROM latest) - 30))
    SELECT s.slot, r.obs_date::text AS date, r.tenor, r.rate::float8 AS rate
    FROM slots s JOIN ust_rates r ON r.curve=$1 AND r.obs_date=s.d WHERE r.rate IS NOT NULL
    ORDER BY s.slot, r.tenor LIMIT 200`, [curve]);
  const treasury = new Map<string, number>();
  if (curve === "yield" && result.rows.length) {
    const dates = [...new Set(result.rows.map((row) => row.date))];
    const official = await db.query<{ series_id: string; date: string; value: number }>(`
      SELECT DISTINCT ON (series_id, obs_date) series_id, obs_date::text AS date, value::float8 AS value FROM macro_observations
      WHERE series_id = ANY($1::text[]) AND obs_date = ANY($2::date[]) AND source_id='treasury'
      ORDER BY series_id, obs_date, realtime_start DESC`, [Object.values(TREASURY_TENORS), dates]);
    for (const row of official.rows) treasury.set(`${row.series_id}|${row.date}`, Number(row.value));
  }
  const snapshot = (slot: string): CurveSnapshot | null => {
    const rows = result.rows.filter((row) => row.slot === slot);
    if (!rows.length) return null;
    const date = rows[0].date;
    const points = rows.map((row): RatePoint => {
      const series = TREASURY_TENORS[row.tenor];
      const official = series ? treasury.get(`${series}|${date}`) : undefined;
      return official === undefined ? { tenor: row.tenor, rate: Number(row.rate), source: "eodhd" } : { tenor: row.tenor, rate: official, source: "treasury" };
    }).sort(byTenor);
    return { date, points };
  };
  return { latest: snapshot("latest"), weekAgo: snapshot("week"), monthAgo: snapshot("month") };
}

export interface PolicyRate { date: string; value: number }
/** Effective federal funds rate (FRED FEDFUNDS, monthly) from macro_observations. EODHD has no policy-rate endpoint. */
export async function fedFundsRate(db: Query | null = getPool()): Promise<PolicyRate | null> {
  if (!db) return null;
  const result = await db.query<{ date: string; value: number }>(`SELECT obs_date::text AS date, value::float8 AS value FROM macro_observations
    WHERE series_id='FEDFUNDS' ORDER BY obs_date DESC, realtime_start DESC LIMIT 1`);
  const row = result.rows[0];
  return row ? { date: row.date, value: Number(row.value) } : null;
}

export type CalendarEvent = EconomicEventRow;

/** Events from `from` (inclusive) to `to` (exclusive), oldest first unless `newestFirst`. */
export async function economicCalendar(options: { from: string; to: string; country?: string; newestFirst?: boolean; limit?: number }, db: Query | null = getPool()): Promise<CalendarEvent[]> {
  if (!db) return [];
  const result = await db.query<CalendarEvent>(`SELECT event_key AS key, country, event_type AS type, comparison, period,
      to_char(event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "eventAt",
      actual::float8 AS actual, previous::float8 AS previous, estimate::float8 AS estimate, change::float8 AS change, change_pct::float8 AS "changePct"
    FROM economic_events WHERE event_at >= $1::timestamptz AND event_at < $2::timestamptz AND ($3::text IS NULL OR country=$3)
    ORDER BY event_at ${options.newestFirst ? "DESC" : "ASC"}, country, event_type LIMIT $4`,
  [options.from, options.to, options.country ?? null, Math.min(options.limit ?? 150, 500)]);
  return result.rows;
}

export async function eventCountries(db: Query | null = getPool()): Promise<string[]> {
  if (!db) return [];
  const result = await db.query<{ country: string }>("SELECT DISTINCT country FROM economic_events ORDER BY country LIMIT 60");
  return result.rows.map((row) => row.country);
}

export interface IndicatorValue { country: string; countryName: string | null; indicator: string; indicatorName: string | null; date: string; value: number }
/** Newest non-null value of each stored country indicator. */
export async function latestIndicators(db: Query | null = getPool()): Promise<IndicatorValue[]> {
  if (!db) return [];
  const result = await db.query<IndicatorValue>(`SELECT DISTINCT ON (country, indicator) country, country_name AS "countryName", indicator,
      indicator_name AS "indicatorName", obs_date::text AS date, value::float8 AS value
    FROM macro_indicators WHERE value IS NOT NULL ORDER BY country, indicator, obs_date DESC LIMIT 1000`);
  return result.rows.map((row) => ({ ...row, value: Number(row.value) }));
}
