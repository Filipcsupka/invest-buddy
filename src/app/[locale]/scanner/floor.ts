import { DISCOVERY } from "@/jobs/discovery-config";

/** Scanner default floor. Same values as the discovery screen (DS1): 2M USD average daily value, 300M USD market cap. */
export const SCANNER_FLOOR = { minAvgDollarVolumeUsd: DISCOVERY.minAvgDollarVolumeUsd, minMarketCapUsd: DISCOVERY.minMarketCapUsd, days: DISCOVERY.avgDollarVolumeDays } as const;

/** Floor inputs for one ticker. Null means the figure is not stored, never zero. */
export type FloorMetrics = { avgDollarVolume: number | null; marketCap: number | null };
export type FloorState = "below" | "unknown" | "ok";

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** Mean of close times volume over the last `days` bars, null with fewer bars or a bad value. Market cap is last close times the latest SEC share count, null without one. */
export function floorMetrics(bars: readonly { close: number; volume: number }[], sharesOutstanding: number | null | undefined, days = SCANNER_FLOOR.days): FloorMetrics {
  const recent = bars.slice(-days);
  const ok = recent.length >= days && recent.every((b) => finite(b.close) && finite(b.volume));
  const last = bars.at(-1);
  return {
    avgDollarVolume: ok ? recent.reduce((sum, b) => sum + b.close * b.volume, 0) / recent.length : null,
    marketCap: finite(sharesOutstanding) && sharesOutstanding > 0 && last && finite(last.close) ? last.close * sharesOutstanding : null,
  };
}

/** Below when a known figure is under its floor. Unknown figures never hide a ticker; they are marked instead. */
export function floorState(metrics: FloorMetrics | undefined): FloorState {
  if (!metrics) return "unknown";
  if ((finite(metrics.avgDollarVolume) && metrics.avgDollarVolume < SCANNER_FLOOR.minAvgDollarVolumeUsd) || (finite(metrics.marketCap) && metrics.marketCap < SCANNER_FLOOR.minMarketCapUsd)) return "below";
  return finite(metrics.avgDollarVolume) && finite(metrics.marketCap) ? "ok" : "unknown";
}
