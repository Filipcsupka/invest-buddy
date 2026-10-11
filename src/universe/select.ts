/** Pure universe selection (D35). No I/O: the script gathers inputs, this module ranks and explains. */
import { createHash } from "node:crypto";

export const CRITERIA_VERSION = "d35-2026-10-draft";

export const UNIVERSE_CRITERIA = {
  target: 150,
  minRevenueQuarters: 4,
  minPrice: 5,
  minAvgDollarVolume: 10_000_000,
  minBarDays: 50,
  growthFirstPct: 15,
  sectorCapPct: 25,
} as const;
export type UniverseCriteria = { [K in keyof typeof UNIVERSE_CRITERIA]: number };

export type ReasonCode =
  | "not_common_stock" | "foreign_filer" | "filer_unknown" | "no_revenue_history" | "short_revenue_history"
  | "no_growth_data" | "growth_not_positive" | "no_price_data" | "short_bar_history" | "price_below_min"
  | "volume_below_floor" | "sector_cap" | "below_cut";

export type Candidate = {
  ticker: string; name: string; sector: string; cik: number | null;
  /** SEC form types seen for this company (filing_watch, fundamentals_pit). */
  forms: string[];
  core: boolean;
  revenueQuarters: number;
  /** Latest quarterly revenue against the same quarter a year earlier, in percent. */
  yoyGrowthPct: number | null;
  lastClose: number | null;
  avgDollarVolume50: number | null;
  barDays: number;
};

export type Selected = Candidate & { rank: number; list: "core" | "extended"; group: "core" | "growth" | "other"; notes: string[] };
export type Excluded = { ticker: string; name: string; sector: string; reason: ReasonCode };
export type Selection = { criteria: UniverseCriteria; selected: Selected[]; excluded: Excluded[]; sectorCap: number };

const NON_COMMON_NAME = /\b(warrants?|units?|rights?|preferred|depositary|notes|etf|trust)\b/i;
const COMMON_TICKER = /^[A-Z]{1,5}([.-][A-C])?$/;

export function isCommonStock(c: Pick<Candidate, "ticker" | "name">): boolean {
  return COMMON_TICKER.test(c.ticker) && !NON_COMMON_NAME.test(c.name);
}

export function filerType(forms: string[]): "domestic" | "foreign" | "unknown" {
  const set = new Set(forms.map((f) => f.toUpperCase().replace(/\/A$/, "")));
  if (["10-K", "10-Q"].some((f) => set.has(f))) return "domestic";
  if (["20-F", "6-K", "40-F"].some((f) => set.has(f))) return "foreign";
  return set.has("8-K") ? "domestic" : "unknown";
}

/** First failed criterion, or null. Order is fixed so reason codes are stable. */
export function failedCriterion(c: Candidate, k: UniverseCriteria): ReasonCode | null {
  if (!isCommonStock(c)) return "not_common_stock";
  const filer = filerType(c.forms);
  if (filer === "foreign") return "foreign_filer";
  if (filer === "unknown") return "filer_unknown";
  if (c.revenueQuarters === 0) return "no_revenue_history";
  if (c.revenueQuarters < k.minRevenueQuarters) return "short_revenue_history";
  if (c.yoyGrowthPct === null) return "no_growth_data";
  if (c.yoyGrowthPct <= 0) return "growth_not_positive";
  if (c.lastClose === null || c.avgDollarVolume50 === null) return "no_price_data";
  if (c.barDays < k.minBarDays) return "short_bar_history";
  if (c.lastClose <= k.minPrice) return "price_below_min";
  if (c.avgDollarVolume50 <= k.minAvgDollarVolume) return "volume_below_floor";
  return null;
}

const byTicker = (a: { ticker: string }, b: { ticker: string }) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);

export function selectUniverse(input: Candidate[], overrides: Partial<UniverseCriteria> = {}): Selection {
  const k: UniverseCriteria = { ...UNIVERSE_CRITERIA, ...overrides };
  const seen = new Set<string>();
  const all = [...input].sort(byTicker).filter((c) => !seen.has(c.ticker) && seen.add(c.ticker));
  const sectorCap = Math.floor((k.target * k.sectorCapPct) / 100);
  const sectorCount = new Map<string, number>();
  const bump = (sector: string) => sectorCount.set(sector, (sectorCount.get(sector) ?? 0) + 1);

  const selected: Selected[] = [];
  for (const c of all.filter((x) => x.core)) {
    const failed = failedCriterion(c, k);
    selected.push({ ...c, rank: 0, list: "core", group: "core", notes: failed ? [`kept as core, fails: ${failed}`] : [] });
    bump(c.sector);
  }
  const excluded: Excluded[] = [];
  const eligible: Candidate[] = [];
  for (const c of all.filter((x) => !x.core)) {
    const failed = failedCriterion(c, k);
    if (failed) excluded.push({ ticker: c.ticker, name: c.name, sector: c.sector, reason: failed });
    else eligible.push(c);
  }
  const isGrowth = (c: Candidate) => (c.yoyGrowthPct ?? 0) > k.growthFirstPct;
  eligible.sort((a, b) => Number(isGrowth(b)) - Number(isGrowth(a))
    || (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0)
    || (b.avgDollarVolume50 ?? 0) - (a.avgDollarVolume50 ?? 0)
    || byTicker(a, b));
  for (const c of eligible) {
    const reason: ReasonCode | null = selected.length >= k.target ? "below_cut"
      : (sectorCount.get(c.sector) ?? 0) >= sectorCap ? "sector_cap" : null;
    if (reason) { excluded.push({ ticker: c.ticker, name: c.name, sector: c.sector, reason }); continue; }
    selected.push({ ...c, rank: 0, list: "extended", group: isGrowth(c) ? "growth" : "other", notes: [] });
    bump(c.sector);
  }
  selected.forEach((row, i) => { row.rank = i + 1; });
  excluded.sort(byTicker);
  return { criteria: k, selected, excluded, sectorCap };
}

export type QuarterRevenue = { periodEnd: string; value: number };
const DAY = 86_400_000;

/** Distinct quarters and latest YoY growth from three-month revenue facts (one value per period end). */
export function revenueGrowth(quarters: QuarterRevenue[]): { quarters: number; yoyGrowthPct: number | null } {
  const byEnd = new Map(quarters.map((q) => [q.periodEnd, q.value]));
  const ends = [...byEnd.keys()].sort();
  const latest = ends[ends.length - 1];
  if (!latest) return { quarters: 0, yoyGrowthPct: null };
  const latestMs = Date.parse(latest);
  const prior = ends.find((e) => Math.abs(latestMs - Date.parse(e) - 365 * DAY) <= 20 * DAY);
  const previous = prior === undefined ? undefined : byEnd.get(prior);
  const current = byEnd.get(latest) as number;
  if (previous === undefined || previous <= 0) return { quarters: ends.length, yoyGrowthPct: null };
  return { quarters: ends.length, yoyGrowthPct: ((current - previous) / previous) * 100 };
}

export function barMetrics(bars: { close: number; volume: number }[]): { lastClose: number | null; avgDollarVolume50: number | null; barDays: number } {
  const last = bars.slice(-50);
  if (!last.length) return { lastClose: null, avgDollarVolume50: null, barDays: 0 };
  return { lastClose: last[last.length - 1].close, avgDollarVolume50: last.reduce((s, b) => s + b.close * b.volume, 0) / last.length, barDays: last.length };
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v: number | null, digits: number) => (v === null ? null : v.toFixed(digits));

export function selectedCsv(s: Selection): string {
  const head = "rank,ticker,name,sector,list,group,yoy_growth_pct,avg_dollar_volume_50d,last_close,revenue_quarters,cik,notes";
  const rows = s.selected.map((r) => [r.rank, r.ticker, r.name, r.sector, r.list, r.group, num(r.yoyGrowthPct, 2), num(r.avgDollarVolume50, 0),
    num(r.lastClose, 2), r.revenueQuarters, r.cik, r.notes.join("; ")].map(csvCell).join(","));
  return `${[head, ...rows].join("\n")}\n`;
}

export function excludedCsv(s: Selection): string {
  return `${["ticker,name,sector,reason", ...s.excluded.map((r) => [r.ticker, r.name, r.sector, r.reason].map(csvCell).join(","))].join("\n")}\n`;
}

export function reviewMarkdown(s: Selection, asOf: string, hashes: { selected: string; excluded: string }): string {
  const count = <T,>(items: T[], key: (t: T) => string) => [...items.reduce((m, i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1), new Map<string, number>())].sort(([a], [b]) => (a < b ? -1 : 1));
  const adds = s.selected.filter((r) => r.list === "extended");
  const lines = [
    `# Universe selection review (${CRITERIA_VERSION}), data as of ${asOf}`,
    "",
    "Dry run. Nothing was written to the database. Thresholds are placeholders until the owner approves `docs/universe-criteria.md`.",
    "",
    `- Target ${s.criteria.target}, selected ${s.selected.length}: ${s.selected.filter((r) => r.list === "core").length} core, ${adds.length} proposed adds (${adds.filter((r) => r.group === "growth").length} above ${s.criteria.growthFirstPct}% growth).`,
    `- Excluded ${s.excluded.length}. Sector cap ${s.sectorCap} names.`,
    `- sha256 selected.csv ${hashes.selected}`,
    `- sha256 excluded.csv ${hashes.excluded}`,
    "",
    "## Excluded by reason", "", ...count(s.excluded, (e) => e.reason).map(([k, n]) => `- ${k}: ${n}`),
    "", "## Selected by sector", "", ...count(s.selected, (r) => r.sector).map(([k, n]) => `- ${k}: ${n}`),
    "", "## Core names failing a criterion (kept anyway)", "",
    ...(s.selected.some((r) => r.notes.length) ? s.selected.filter((r) => r.notes.length).map((r) => `- ${r.ticker}: ${r.notes.join("; ")}`) : ["- none"]),
    "", "## Proposed adds", "", "Review only. Import after approval with `scripts/universe-change.ts` (D36), one row each:", "",
    ...adds.map((r) => `- ${r.rank}. ${r.ticker} (${r.sector}, ${r.yoyGrowthPct === null ? "n/a" : r.yoyGrowthPct.toFixed(1)}% YoY)`),
    "",
  ];
  return lines.join("\n");
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
