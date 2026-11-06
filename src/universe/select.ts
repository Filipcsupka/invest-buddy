/** Pure universe selection (D35). No I/O: the script gathers inputs, this module ranks and explains. */
import { createHash } from "node:crypto";
import { UNCLASSIFIED } from "./sector";
import { isUniverseExchange, knownUsdPerUnit, marketIdentity } from "./market";

export const CRITERIA_VERSION = "p6-market-2026-10-draft";

export const UNIVERSE_CRITERIA = {
  target: 150,
  minRevenueQuarters: 4,
  /** Half-yearly reporters (most LSE and many EU issuers) need three dated half-year periods instead. */
  minRevenueHalfYears: 3,
  minPriceUsd: 5,
  minAvgDollarVolumeUsd: 10_000_000,
  minMarketCapUsd: 300_000_000,
  minBarDays: 50,
  growthFirstPct: 15,
  sectorCapPct: 25,
} as const;
export type UniverseCriteria = { [K in keyof typeof UNIVERSE_CRITERIA]: number } & {
  /**
   * Per-exchange override of minAvgDollarVolumeUsd. Empty by default, so every market uses the same USD floor. EODHD volume for
   * European listings is primary-venue only (no MTF or consolidated volume), which biases this floor against EU names.
   */
  minAvgDollarVolumeUsdByExchange?: Readonly<Partial<Record<string, number>>>;
};

export type ReasonCode =
  | "not_common_stock" | "foreign_filer" | "filer_unknown" | "no_revenue_history" | "short_revenue_history"
  | "no_growth_data" | "growth_not_positive" | "no_price_data" | "short_bar_history" | "price_below_min"
  | "volume_below_floor" | "market_cap_unknown" | "market_cap_below_floor" | "fx_unavailable" | "fx_stale" | "unsupported_exchange"
  | "currency_unverified_gbx" | "listing_not_synced"
  | "duplicate_filer" | "sector_cap" | "below_cut";

export type Candidate = {
  ticker: string; name: string; sector: string; cik: number | null;
  /** Internal instrument key may be exchange-qualified; exchange identifies the actual listing. */
  exchange?: string; currency?: string; vendorSymbol?: string | null; usdPerUnit?: number | null; marketCapUsd?: number | null; securityType?: string | null;
  /** SEC form types seen for this company (filing_watch, fundamentals_pit). */
  forms: string[];
  core: boolean;
  /** Distinct dated revenue periods (quarters, or half-years when revenuePeriod is "half"). */
  revenueQuarters: number;
  /** Latest quarterly revenue against the same quarter a year earlier, in percent. */
  yoyGrowthPct: number | null;
  /** Length of the revenue periods counted in revenueQuarters. Absent means quarterly. */
  revenuePeriod?: RevenuePeriod;
  /** Set by the read model when the listing cannot be trusted for this date (unknown pence quote, symbol not yet synced). */
  listingIssue?: "currency_unverified_gbx" | "listing_not_synced";
  /** Set by the read model when an FX rate exists but is too old or a cross rate mixes dates. */
  fxIssue?: "fx_stale";
  /** Previous period's year-over-year growth, when enough dated periods exist. */
  priorYoyGrowthPct?: number | null;
  lastClose: number | null;
  avgDollarVolume50: number | null;
  barDays: number;
};

export type Selected = Candidate & { rank: number; list: "core" | "extended"; group: "core" | "growth" | "other"; notes: string[] };
export type Excluded = { ticker: string; name: string; sector: string; reason: ReasonCode };
export type Selection = { criteria: UniverseCriteria; selected: Selected[]; excluded: Excluded[]; sectorCap: number };

/** Second filers of an already listed company (same revenue under another CIK). Explicit list; the first name is the one kept. */
export const DUPLICATE_FILERS: Readonly<Record<string, { of: string; note: string }>> = {
  SUNC: { of: "SUN", note: "same revenue as SUN (14,259M USD in the 2026-10-18 pool)" },
};

const NON_COMMON_NAME = /\b(warrants?|units?|rights?|preferred|depositary|notes|etf|trust)\b/i;
/** US codes keep the D35 pattern: one to five letters and an optional A-C share class, so BAC-PL, XYZ.WS and XYZ.U stay out. */
const US_COMMON_CODE = /^[A-Z]{1,5}([.-][A-C])?$/;
/** European codes can contain digits and longer classes; non-common lines are caught by NON_COMMON_NAME and the EODHD type. */
const NON_US_COMMON_CODE = /^[A-Z0-9]{1,12}([.-][A-Z0-9]{1,3})?$/;

export function isCommonStock(c: Pick<Candidate, "ticker" | "name" | "exchange" | "securityType" | "vendorSymbol">): boolean {
  const exchange = c.exchange ?? "US";
  const code = c.ticker.endsWith(`.${exchange}`) ? c.ticker.slice(0, -(exchange.length + 1)) : c.ticker;
  return isUniverseExchange(exchange) && (exchange === "US" || c.ticker.endsWith(`.${exchange}`))
    && (exchange === "US" ? US_COMMON_CODE : NON_US_COMMON_CODE).test(code) && !NON_COMMON_NAME.test(c.name)
    && (!c.vendorSymbol || !!c.securityType) && (!c.securityType || /^(common stock|equity)$/i.test(c.securityType));
}

export function filerType(forms: string[]): "domestic" | "foreign" | "unknown" {
  const set = new Set(forms.map((f) => f.toUpperCase().replace(/\/A$/, "")));
  if (["10-K", "10-Q"].some((f) => set.has(f))) return "domestic";
  if (["20-F", "6-K", "40-F"].some((f) => set.has(f))) return "foreign";
  return set.has("8-K") ? "domestic" : "unknown";
}

/** First failed criterion, or null. Order is fixed so reason codes are stable. */
export function failedCriterion(c: Candidate, k: UniverseCriteria): ReasonCode | null {
  const exchange = c.exchange ?? "US";
  if (!isUniverseExchange(exchange)) return "unsupported_exchange";
  if (!isCommonStock(c)) return "not_common_stock";
  if (c.listingIssue) return c.listingIssue;
  if (exchange === "US") {
    if (DUPLICATE_FILERS[c.ticker.replace(/\.US$/, "")]) return "duplicate_filer";
    const filer = filerType(c.forms);
    if (filer === "foreign") return "foreign_filer";
    if (filer === "unknown") return "filer_unknown";
  }
  if (c.revenueQuarters === 0) return "no_revenue_history";
  if (c.revenueQuarters < (c.revenuePeriod === "half" ? k.minRevenueHalfYears : k.minRevenueQuarters)) return "short_revenue_history";
  if (c.yoyGrowthPct === null) return "no_growth_data";
  if (c.yoyGrowthPct <= 0) return "growth_not_positive";
  if (c.lastClose === null || c.avgDollarVolume50 === null) return "no_price_data";
  if (c.barDays < k.minBarDays) return "short_bar_history";
  const fx = knownUsdPerUnit(c);
  if (fx === null) return c.fxIssue ?? "fx_unavailable";
  if (c.lastClose * fx <= k.minPriceUsd) return "price_below_min";
  if (c.avgDollarVolume50 * fx <= (k.minAvgDollarVolumeUsdByExchange?.[exchange] ?? k.minAvgDollarVolumeUsd)) return "volume_below_floor";
  // US names without a dated share count keep the D35 rule (no market-cap floor); every other listing needs a dated cap.
  const cap = typeof c.marketCapUsd === "number" && Number.isFinite(c.marketCapUsd) ? c.marketCapUsd : null;
  if (cap === null) return exchange === "US" ? null : "market_cap_unknown";
  if (cap <= k.minMarketCapUsd) return "market_cap_below_floor";
  return null;
}

const byTicker = (a: { ticker: string }, b: { ticker: string }) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);

export function selectUniverse(input: Candidate[], overrides: Partial<UniverseCriteria> = {}): Selection {
  const k: UniverseCriteria = { ...UNIVERSE_CRITERIA, ...overrides };
  const seen = new Set<string>();
  const all = [...input].sort(byTicker).filter((c) => {
    const key = marketIdentity(c.ticker, c.exchange);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sectorCap = Math.floor((k.target * k.sectorCapPct) / 100);
  const sectorCount = new Map<string, number>();
  const bump = (sector: string) => sectorCount.set(sector, (sectorCount.get(sector) ?? 0) + 1);
  /** `Unclassified` is not a sector, so it is never capped. */
  const capped = (sector: string) => sector !== UNCLASSIFIED && (sectorCount.get(sector) ?? 0) >= sectorCap;

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
    || (b.avgDollarVolume50 ?? 0) * (knownUsdPerUnit(b) ?? 0) - (a.avgDollarVolume50 ?? 0) * (knownUsdPerUnit(a) ?? 0)
    || byTicker(a, b));
  for (const c of eligible) {
    const reason: ReasonCode | null = selected.length >= k.target ? "below_cut"
      : capped(c.sector) ? "sector_cap" : null;
    if (reason) { excluded.push({ ticker: c.ticker, name: c.name, sector: c.sector, reason }); continue; }
    selected.push({ ...c, rank: 0, list: "extended", group: isGrowth(c) ? "growth" : "other", notes: [] });
    bump(c.sector);
  }
  selected.forEach((row, i) => { row.rank = i + 1; });
  excluded.sort(byTicker);
  return { criteria: k, selected, excluded, sectorCap };
}

export type QuarterRevenue = { periodEnd: string; value: number };
export type RevenuePeriod = "quarter" | "half";
const DAY = 86_400_000;

/** Distinct periods and latest YoY growth from same-length revenue facts (quarters or half-years, one value per period end). */
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
  const head = "rank,ticker,exchange,currency,name,sector,list,group,yoy_growth_pct,avg_local_volume_50d,last_local_close,market_cap_usd,revenue_quarters,cik,notes";
  const rows = s.selected.map((r) => [r.rank, r.ticker, r.exchange ?? "US", r.currency ?? "USD", r.name, r.sector, r.list, r.group, num(r.yoyGrowthPct, 2), num(r.avgDollarVolume50, 0),
    num(r.lastClose, 2), num(r.marketCapUsd ?? null, 0), r.revenueQuarters, r.cik, r.notes.join("; ")].map(csvCell).join(","));
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
    "Internal review only. EODHD-derived prices, volumes and fundamentals have no verified public display rights.",
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
