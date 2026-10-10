import { score } from "./score";
import type { Fundamentals, Macro, OHLCV, ScoreResult } from "./types";

/** Scores one ticker on a date: bars after the date are ignored, and prices more than 3 days old make the row insufficient. Used by the daily job and by score replay. */
export function scoreAsOf(input: { ticker: string; bars: OHLCV[]; fundamentals: Fundamentals; macro: Macro }, date: string): ScoreResult {
  const throughDate = input.bars.filter((bar) => bar.date <= date);
  const result = score({ ticker: input.ticker, bars: throughDate, fundamentals: input.fundamentals, macro: input.macro });
  const latestBar = throughDate.at(-1)?.date;
  const ageDays = latestBar ? (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${latestBar}T00:00:00Z`)) / 86_400_000 : Infinity;
  if (ageDays > 3) {
    result.state = "Insufficient/invalid data";
    result.invalidReasons = [...result.invalidReasons, "stale_prices"];
    result.technical = 0; result.fundamentals = 0; result.macro = 0; result.total = 0;
    result.ruleHits = []; result.rejectionReasons = []; result.pullbackInUptrend = false;
  }
  return { ...result, asOf: date };
}
