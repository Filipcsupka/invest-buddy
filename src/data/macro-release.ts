import type pg from "pg";
import { FRED_CPI_SERIES, FRED_PPI_SERIES, fredSeriesUrl } from "../collectors/fred";
import { MACRO_EVENTS } from "./macro-calendar";

export interface MacroReleaseFact {
  kind: "CPI" | "PPI";
  seriesId: string;
  releaseDate: string;
  observationDate: string;
  actual: number;
  prior: number;
  change: number;
  sourceUrl: string;
}

const SERIES = { CPI: FRED_CPI_SERIES, PPI: FRED_PPI_SERIES } as const;
type ReleaseKind = keyof typeof SERIES;

/** The BLS CPI and PPI releases describe the preceding calendar month. */
function referenceMonth(releaseDate: string): string {
  const date = new Date(`${releaseDate}T00:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

/** A schedule row is a gate, not proof that FRED has published the new observation. */
export function releaseFact(kind: ReleaseKind, releaseDate: string, observations: readonly { date: string; value: number }[]): MacroReleaseFact | null {
  const [prior, actual] = observations.slice(-2);
  if (!prior || !actual || actual.date.slice(0, 7) !== referenceMonth(releaseDate) || prior.date >= actual.date || !Number.isFinite(actual.value) || !Number.isFinite(prior.value)) return null;
  return { kind, seriesId: SERIES[kind], releaseDate, observationDate: actual.date, actual: actual.value, prior: prior.value,
    change: Number((actual.value - prior.value).toFixed(6)), sourceUrl: fredSeriesUrl(SERIES[kind]) };
}

/** Read P1's stored release dates when available; use its static schedule until the table is deployed. */
export async function releaseKindsOn(db: Pick<pg.Pool, "query">, releaseDate: string): Promise<ReleaseKind[]> {
  const fallback = MACRO_EVENTS.filter((event) => event.date === releaseDate && (event.kind === "CPI" || event.kind === "PPI")).map((event) => event.kind as ReleaseKind);
  const table = await db.query<{ present: string | null }>("SELECT to_regclass('macro_events')::text AS present");
  if (!table.rows[0]?.present) return fallback;
  const rows = await db.query<{ kind: string; date: string }>("SELECT kind,event_date::text AS date FROM macro_events WHERE event_date >= $1::date AND kind IN ('CPI','PPI') ORDER BY event_date,kind", [releaseDate]);
  const newest = new Map<string, string>();
  for (const row of rows.rows) if (row.kind === "CPI" || row.kind === "PPI") newest.set(row.kind, row.date);
  const storedToday = rows.rows.filter((row) => row.date === releaseDate && (row.kind === "CPI" || row.kind === "PPI")).map((row) => row.kind as ReleaseKind);
  return [...new Set([...storedToday, ...fallback.filter((kind) => !newest.has(kind) || releaseDate > newest.get(kind)!)])].sort();
}

export async function macroReleaseFacts(db: Pick<pg.Pool, "query">, releaseDate: string): Promise<MacroReleaseFact[]> {
  const kinds = await releaseKindsOn(db, releaseDate);
  const facts: MacroReleaseFact[] = [];
  for (const kind of kinds) {
    // The nightly job fetches after the US release. Freeze the vintage at the next calendar day so a later FRED revision cannot rewrite the original release fact.
    const rows = await db.query<{ date: string; value: number }>(`SELECT date,value FROM (
      SELECT DISTINCT ON (obs_date) obs_date::text AS date,value::float8 AS value FROM macro_observations
      WHERE series_id=$1 AND obs_date <= $2::date AND realtime_start <= $2::date + 1
      ORDER BY obs_date,realtime_start DESC
    ) t ORDER BY date DESC LIMIT 2`, [SERIES[kind], releaseDate]);
    const fact = releaseFact(kind, releaseDate, rows.rows.reverse());
    if (fact) facts.push(fact);
  }
  return facts;
}

/** One compact private digest line; FRED index values are not inflation rates or a consensus comparison. */
export function ownerMacroReleaseLine(facts: readonly MacroReleaseFact[]): string | null {
  if (!facts.length) return null;
  const number = (value: number) => Number(value.toFixed(3)).toString();
  return `Macro releases: ${facts.map((fact) => `${fact.kind} ${number(fact.actual)} (prior ${number(fact.prior)}, change ${fact.change >= 0 ? "+" : ""}${number(fact.change)} index points)`).join("; ")}.`;
}
