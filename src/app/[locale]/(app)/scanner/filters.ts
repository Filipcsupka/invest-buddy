import type { StoreRow } from "@/data/store";
import { sectorLabel, stateKey } from "@/i18n/score-text";
import type { Locale } from "@/i18n";
import { stateOrder, type StateKey } from "@/i18n/rules";
import type { RuleStreak } from "@/db/rules-streak";
import { floorState, type FloorMetrics } from "./floor";
import { matchesPreset, presetById, presetIds, type PresetId } from "./presets";
import type { PublicHorizon } from "@/data/public-horizons";

export type ScannerFilters = {
  q: string; state: StateKey | ""; min: number | null; max: number | null;
  sector: string; f: number | null; t: number | null; m: number | null;
  held: boolean; floor: boolean; preset: PresetId | ""; source: StoreRow["instrument"]["source"] | "";
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
    held: first(query.held) === "yes", floor: first(query.floor) !== "off", preset: presetIds.includes(first(query.preset) as PresetId) ? first(query.preset) as PresetId : "",
    source: ["guide", "discovery", "sample extension"].includes(source) ? source as ScannerFilters["source"] : "",
    sort: ["ticker", "sector", "f", "t", "m", "state"].includes(sort) ? sort as ScannerFilters["sort"] : "score",
  };
}
export function hasFilters(filters: ScannerFilters): boolean {
  return Boolean(filters.q || filters.state || filters.min !== null || filters.max !== null || filters.sector || filters.f !== null || filters.t !== null || filters.m !== null || filters.held || !filters.floor || filters.preset || filters.source || filters.sort !== "score");
}
/** Scanner URL for the current filters with the floor set on or off. Defaults are left out so the default URL stays clean. */
export function filtersHref(locale: Locale, filters: ScannerFilters, floor: boolean): string {
  const params = new URLSearchParams();
  const add = (key: string, value: string | number | null | false) => { if (value !== null && value !== "" && value !== false) params.set(key, String(value)); };
  add("q", filters.q); add("state", filters.state); add("min", filters.min); add("max", filters.max); add("sector", filters.sector);
  add("f", filters.f); add("t", filters.t); add("m", filters.m); add("held", filters.held && "yes"); add("preset", filters.preset); add("source", filters.source);
  add("sort", filters.sort !== "score" && filters.sort);
  if (!floor) params.set("floor", "off");
  const query = params.toString();
  return `/${locale}/scanner${query ? `?${query}` : ""}`;
}
export function filterScores(rows: StoreRow[], filters: ScannerFilters, heldTickers: ReadonlySet<string>, locale: Locale = "en", streaks: Readonly<Record<string, RuleStreak>> = {}, floor: Readonly<Record<string, FloorMetrics>> = {}, horizons: Readonly<Record<string, PublicHorizon>> = {}): StoreRow[] {
  const preset = filters.preset ? presetById(filters.preset) : undefined;
  const q = filters.q.toLocaleLowerCase();
  return rows.filter(({ instrument, result }) => (!q || `${instrument.ticker} ${instrument.name} ${instrument.sector} ${sectorLabel(locale, instrument.sector)}`.toLocaleLowerCase(locale).includes(q))
    && (!filters.state || filters.state === stateKey(result.state))
    && (filters.min === null || result.total >= filters.min)
    && (filters.max === null || result.total <= filters.max)
    && (!filters.sector || instrument.sector === filters.sector)
    && (filters.f === null || result.fundamentals >= filters.f)
    && (filters.t === null || result.technical >= filters.t)
    && (filters.m === null || result.macro >= filters.m)
    && (!preset || matchesPreset(preset, result.ruleHits, streaks[instrument.ticker], horizons[instrument.ticker]))
    && (!filters.floor || heldTickers.has(instrument.ticker) || floorState(floor[instrument.ticker]) !== "below")
    && (!filters.held || heldTickers.has(instrument.ticker))
    && (!filters.source || instrument.source === filters.source));
}
