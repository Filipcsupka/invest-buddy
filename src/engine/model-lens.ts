import type { SectorGroup } from "@/universe/sector-groups";
import type { Theme } from "@/universe/themes";
import { decidingTieBreak, type ShortlistRow, type TieBreak } from "./shortlist";
import { SHORTLIST_CONFIG, type ShortlistConfig } from "./shortlist-config";

/**
 * Model portfolio diversification lens (S1, docs/shortlist.md). Pure functions; no I/O and no clock.
 *
 * The model portfolio is the owner's IBKR holdings from the stored Flex snapshot: position weights only, no amounts. Weights are
 * summed per theme and per sector group. A shortlist name whose theme the model already holds above `themeCapPercent` moves below
 * the names that do not; inside each part the shortlist order stays. "Other" and Unknown are never treated as above a cap: they are
 * mixed buckets, not themes. A sector group above `sectorGroupCapPercent` is shown as a note and does not move a name.
 * Without a model portfolio there is no lens and the shortlist order stays as it is.
 */

export interface ModelHolding { symbol: string; weightPercent: number; theme: Theme; sector: SectorGroup }
export interface ModelPortfolio { asOf: string; holdings: readonly ModelHolding[] }

export interface WeightShare<K extends string> {
  key: K;
  /** Share of the model portfolio in percent, unrounded. Pages round it for display. */
  weightPercent: number;
  /** A named key above its cap. */
  overCap: boolean;
  symbols: string[];
}
export interface ModelWeights { asOf: string; holdings: number; themes: WeightShare<Theme>[]; sectors: WeightShare<SectorGroup>[]; themeCapPercent: number; sectorGroupCapPercent: number }

/**
 * new: the model has none of the theme; below: at or under the cap; over: above the cap; uncapped: the name is in "other", a mixed
 * bucket with no cap whatever its weight; unknown: no theme for the name.
 */
export type LensStatus = "new" | "below" | "over" | "uncapped" | "unknown";
export interface RowLens { status: LensStatus; themeWeightPercent: number; sectorWeightPercent: number; sectorOverCap: boolean }
export interface LensedRow extends ShortlistRow {
  /** Rank before the lens moved anything. */
  shortlistRank: number;
  lens: RowLens | null;
  /** True on the first row placed after the names outside an above-cap theme. Its decidedBy is null. */
  placedByLens: boolean;
}
export interface ModelLens {
  weights: ModelWeights;
  /** Kept names in lens order, ranks renumbered. */
  rows: LensedRow[];
  /** Model themes above the cap, largest first. */
  overThemes: WeightShare<Theme>[];
  /** Number of kept names that moved down. */
  moved: number;
}

type LensConfig = Pick<ShortlistConfig, "themeCapPercent" | "sectorGroupCapPercent">;
const UNCAPPED = new Set<string>(["other", "unknown", "Unknown"]);

function shares<K extends string>(holdings: readonly ModelHolding[], keyOf: (h: ModelHolding) => K, total: number, cap: number): WeightShare<K>[] {
  const byKey = new Map<K, { weight: number; symbols: string[] }>();
  for (const holding of holdings) {
    const entry = byKey.get(keyOf(holding)) ?? { weight: 0, symbols: [] };
    entry.weight += holding.weightPercent;
    entry.symbols.push(holding.symbol);
    byKey.set(keyOf(holding), entry);
  }
  return [...byKey].map(([key, { weight, symbols }]) => {
    const weightPercent = weight * 100 / total;
    return { key, weightPercent, overCap: !UNCAPPED.has(key) && weightPercent > cap, symbols };
  }).sort((a, b) => Number(UNCAPPED.has(a.key)) - Number(UNCAPPED.has(b.key)) || b.weightPercent - a.weightPercent || a.key.localeCompare(b.key));
}

/** Theme and sector group weights of the model portfolio, normalized to the positive weights. Null when nothing is held. */
export function modelWeights(model: ModelPortfolio, config: LensConfig = SHORTLIST_CONFIG): ModelWeights | null {
  const holdings = model.holdings.filter((h) => Number.isFinite(h.weightPercent) && h.weightPercent > 0);
  const total = holdings.reduce((sum, h) => sum + h.weightPercent, 0);
  if (!holdings.length || total <= 0) return null;
  return {
    asOf: model.asOf, holdings: holdings.length,
    themes: shares(holdings, (h) => h.theme, total, config.themeCapPercent),
    sectors: shares(holdings, (h) => h.sector, total, config.sectorGroupCapPercent),
    themeCapPercent: config.themeCapPercent, sectorGroupCapPercent: config.sectorGroupCapPercent,
  };
}

/** Lens facts for one name against the model weights. */
export function rowLens(row: Pick<ShortlistRow, "theme" | "sector">, weights: ModelWeights): RowLens {
  const theme = weights.themes.find((share) => share.key === row.theme);
  const sector = weights.sectors.find((share) => share.key === row.sector);
  const themeWeightPercent = theme?.weightPercent ?? 0;
  const status: LensStatus = row.theme === "unknown" ? "unknown" : row.theme === "other" ? "uncapped" : theme?.overCap ? "over" : themeWeightPercent > 0 ? "below" : "new";
  return { status, themeWeightPercent, sectorWeightPercent: sector?.weightPercent ?? 0, sectorOverCap: sector?.overCap ?? false };
}

/**
 * Reorders kept shortlist rows: names in an above-cap model theme go after all other names; each part keeps the shortlist order.
 * Ranks are renumbered and the order reason is recomputed against the new row above.
 */
export function applyModelLens(kept: readonly ShortlistRow[], model: ModelPortfolio | null, config: LensConfig = SHORTLIST_CONFIG): ModelLens | null {
  if (!model) return null;
  const weights = modelWeights(model, config);
  if (!weights) return null;
  const withLens = kept.map((row, index) => ({ row, lens: rowLens(row, weights), shortlistRank: row.rank ?? index + 1 }));
  const ordered = [...withLens.filter((r) => r.lens.status !== "over"), ...withLens.filter((r) => r.lens.status === "over")];
  const rows: LensedRow[] = ordered.map(({ row, lens, shortlistRank }, index) => {
    const above = ordered[index - 1];
    const placedByLens = !!above && above.lens.status !== "over" && lens.status === "over";
    const decidedBy: TieBreak | null = index === 0 || placedByLens ? null : decidingTieBreak(above.row, row);
    return { ...row, rank: index + 1, decidedBy, shortlistRank, lens, placedByLens };
  });
  return { weights, rows, overThemes: weights.themes.filter((share) => share.overCap), moved: rows.filter((row) => (row.rank ?? 0) > row.shortlistRank).length };
}

/** Kept rows in display order: the lens order when there is a lens, else the shortlist order. */
export function orderedRows(kept: readonly ShortlistRow[], lens: ModelLens | null | undefined): (ShortlistRow | LensedRow)[] {
  return lens ? lens.rows : [...kept];
}

/** Distinct themes, in rank order, of the given rows that the model holds at or below the cap or not at all. */
export function widenedThemes(rows: readonly (ShortlistRow | LensedRow)[]): Theme[] {
  const out: Theme[] = [];
  for (const row of rows) {
    const status = "lens" in row ? row.lens?.status : undefined;
    if ((status === "new" || status === "below") && !out.includes(row.theme) && row.theme !== "other") out.push(row.theme);
  }
  return out;
}

/** SHORTLIST_TOP_N within the config bounds; anything else falls back to the default. */
export function topNFrom(raw: string | undefined, config: Pick<ShortlistConfig, "topN" | "topNMin" | "topNMax"> = SHORTLIST_CONFIG): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= config.topNMin && n <= config.topNMax ? n : config.topN;
}
