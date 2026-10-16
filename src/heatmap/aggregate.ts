import type { ScoreResult } from "@/engine";

export const metrics = ["1m", "3m", "rules"] as const;
export type HeatMetric = (typeof metrics)[number];
export const defaultMetric: HeatMetric = "1m";

/** Trading sessions behind each price window. */
export const windowSessions = { "1m": 21, "3m": 63 } as const;

export type HeatInput = { instrument: { ticker: string; name: string; sector: string }; result: Pick<ScoreResult, "state" | "ruleHits"> & { inputs: { bars: { close: number }[] } } };
export type HeatCell = { ticker: string; name: string; value: number | null };
export type HeatSector = { sector: string; cells: HeatCell[]; average: number | null; counted: number };

/** Reads `?metric=`. Anything unknown, repeated or missing falls back to the default. */
export function parseMetric(value: string | string[] | undefined): HeatMetric {
  const first = Array.isArray(value) ? value[0] : value;
  return (metrics as readonly string[]).includes(first ?? "") ? (first as HeatMetric) : defaultMetric;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Close-to-close change in percent over `sessions` sessions, null when the history is shorter or a price is unusable. */
export function priceChange(bars: { close: number }[], sessions: number): number | null {
  if (bars.length <= sessions) return null;
  const last = bars.at(-1)!.close, first = bars.at(-1 - sessions)!.close;
  if (!Number.isFinite(last) || !Number.isFinite(first) || first <= 0) return null;
  return round((last / first - 1) * 100);
}

/** Share of rules met among the rules that had data, in percent. Null when the ticker is not scored or no rule had data. */
export function rulesShare(result: HeatInput["result"]): number | null {
  if (result.state === "Insufficient/invalid data") return null;
  const known = result.ruleHits.filter((hit) => !hit.unknown);
  if (!known.length) return null;
  return round((known.filter((hit) => hit.matched).length / known.length) * 100);
}

export function cellValue(row: HeatInput, metric: HeatMetric): number | null {
  return metric === "rules" ? rulesShare(row.result) : priceChange(row.result.inputs.bars ?? [], windowSessions[metric]);
}

/** Group the tracked universe by sector. Sectors with no value stay listed with a null average. Tickers and sectors sort alphabetically, so the order is not a ranking. */
export function aggregateSectors(rows: HeatInput[], metric: HeatMetric): HeatSector[] {
  const groups = new Map<string, HeatCell[]>();
  for (const row of rows) {
    const list = groups.get(row.instrument.sector) ?? [];
    list.push({ ticker: row.instrument.ticker, name: row.instrument.name, value: cellValue(row, metric) });
    groups.set(row.instrument.sector, list);
  }
  return [...groups.entries()]
    .map(([sector, cells]) => {
      const values = cells.flatMap((cell) => (cell.value === null ? [] : [cell.value]));
      return {
        sector,
        cells: cells.sort((a, b) => a.ticker.localeCompare(b.ticker)),
        average: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        counted: values.length,
      };
    })
    .sort((a, b) => a.sector.localeCompare(b.sector));
}

/** Colour step 0 to 4. Price change is signed and stepped by size (0 is near flat); rules share runs 0 to 100. */
export function intensity(metric: HeatMetric, value: number): number {
  if (metric === "rules") return Math.min(4, Math.floor(value / 20));
  const size = Math.abs(value) / (metric === "3m" ? 2 : 1);
  return size < 1 ? 0 : size < 3 ? 1 : size < 6 ? 2 : size < 10 ? 3 : 4;
}
