import type { StoreRow } from "@/data/store";
import { sectorLabel, stateKey } from "@/i18n/score-text";
import type { Locale } from "@/i18n";
import { stateOrder, type StateKey } from "@/i18n/rules";

export type ScannerFilters = {
  q: string; state: StateKey | ""; min: number | null; max: number | null;
  sector: string; f: number | null; t: number | null; m: number | null;
  held: boolean; source: StoreRow["instrument"]["source"] | "";
  sort: "score" | "ticker" | "sector" | "f" | "t" | "m" | "state";
};
export type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => typeof value === "string" ? value : value?.[0] ?? "";
const bounded = (value: string, ceiling: number): number | null => /^(?:\d|[12]\d)$/.test(value) && Number(value) <= ceiling ? Number(value) : null;

export function parseFilters(query: Query): ScannerFilters {
  const state = first(query.state);
  const source = first(query.source);
  const sort = first(query.sort);
  return {
    q: first(query.q).trim().slice(0, 80), state: stateOrder.includes(state as StateKey) ? state as StateKey : "",
    min: bounded(first(query.min), 25), max: bounded(first(query.max), 25),
    sector: first(query.sector).slice(0, 80), f: bounded(first(query.f), 10),
    t: bounded(first(query.t), 10), m: bounded(first(query.m), 5),
    held: first(query.held) === "yes",
    source: ["guide", "discovery", "sample extension"].includes(source) ? source as ScannerFilters["source"] : "",
    sort: ["ticker", "sector", "f", "t", "m", "state"].includes(sort) ? sort as ScannerFilters["sort"] : "score",
  };
}
export function hasFilters(filters: ScannerFilters): boolean {
  return Boolean(filters.q || filters.state || filters.min !== null || filters.max !== null || filters.sector || filters.f !== null || filters.t !== null || filters.m !== null || filters.held || filters.source || filters.sort !== "score");
}
export function filterScores(rows: StoreRow[], filters: ScannerFilters, heldTickers: ReadonlySet<string>, locale: Locale = "en"): StoreRow[] {
  const q = filters.q.toLocaleLowerCase();
  return rows.filter(({ instrument, result }) => (!q || `${instrument.ticker} ${instrument.name} ${instrument.sector} ${sectorLabel(locale, instrument.sector)}`.toLocaleLowerCase(locale).includes(q))
    && (!filters.state || filters.state === stateKey(result.state))
    && (filters.min === null || result.total >= filters.min)
    && (filters.max === null || result.total <= filters.max)
    && (!filters.sector || instrument.sector === filters.sector)
    && (filters.f === null || result.fundamentals >= filters.f)
    && (filters.t === null || result.technical >= filters.t)
    && (filters.m === null || result.macro >= filters.m)
    && (!filters.held || heldTickers.has(instrument.ticker))
    && (!filters.source || instrument.source === filters.source));
}
