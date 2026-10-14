import { TREASURY_COLUMNS } from "../data/macro-series";

export interface MacroObservation { seriesId: string; obsDate: string; value: number; realtimeStart: string; sourceId: "fred" | "treasury" | "ecb"; sourceUrl: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const fredSeriesPage = (series: string) => `https://fred.stlouisfed.org/series/${series}`;
export const fredObservationsUrl = (key: string, series: string, opts: { start?: string; end?: string; limit?: number }) =>
  `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${encodeURIComponent(key)}&file_type=json` +
  (opts.limit ? `&sort_order=desc&limit=${opts.limit}` : "&sort_order=asc") + (opts.start ? `&observation_start=${opts.start}` : "") + (opts.end ? `&observation_end=${opts.end}` : "");

/** FRED rows with their vintage date. "." (no value) is dropped. `fetchedOn` is the vintage when the response carries no realtime_start. */
export function parseFredMacro(series: string, text: string, fetchedOn: string): MacroObservation[] {
  const response = JSON.parse(text) as { observations?: { date: string; value: string; realtime_start?: string }[] };
  return (response.observations ?? [])
    .filter((o) => ISO.test(o.date) && o.value !== "." && Number.isFinite(Number(o.value)))
    .map((o) => ({ seriesId: series, obsDate: o.date, value: Number(o.value), realtimeStart: o.realtime_start && ISO.test(o.realtime_start) ? o.realtime_start : fetchedOn, sourceId: "fred" as const, sourceUrl: fredSeriesPage(series) }))
    .sort((a, b) => a.obsDate.localeCompare(b.obsDate));
}

export const TREASURY_PAGE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve";
export const treasuryCurveUrl = (year: number) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;

/** The Treasury file has no commas inside quoted cells, so a plain split is enough. */
const csvCells = (line: string) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
/** Treasury par yield curve CSV (dates MM/DD/YYYY, one column per maturity). Only the 3-month, 2-year and 10-year columns are kept. Blank cells are skipped. Treasury does not revise, so the vintage is the observation date. */
export function parseTreasuryCurve(csv: string): MacroObservation[] {
  const [header, ...lines] = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!header) return [];
  const names = csvCells(header);
  const wanted = names.map((name, index) => ({ index, id: TREASURY_COLUMNS[name] })).filter((c) => c.id);
  if (wanted.length !== Object.keys(TREASURY_COLUMNS).length) throw new Error("Treasury curve CSV is missing an expected column");
  const out: MacroObservation[] = [];
  for (const line of lines) {
    const cells = csvCells(line);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0] ?? "");
    if (!m) continue;
    const date = `${m[3]}-${m[1]}-${m[2]}`;
    for (const { index, id } of wanted) {
      const raw = cells[index];
      if (raw === undefined || raw === "" || !Number.isFinite(Number(raw))) continue;
      out.push({ seriesId: id, obsDate: date, value: Number(raw), realtimeStart: date, sourceId: "treasury", sourceUrl: TREASURY_PAGE });
    }
  }
  return out.sort((a, b) => a.obsDate.localeCompare(b.obsDate) || a.seriesId.localeCompare(b.seriesId));
}
