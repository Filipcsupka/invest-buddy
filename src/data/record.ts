import { score } from "../engine";
import type { OHLCV } from "../engine";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "./fixtures";

export function fixtureRecord() {
  const endpoints = [210, 215, 220];
  return endpoints.flatMap((end) => instruments.map((instrument) => ({
    instrument,
    result: score({ ticker: instrument.ticker, bars: fixtureBars(instrument.ticker).slice(0, end), fundamentals: fixtureFundamentals(instrument.ticker), macro: fixtureMacro(instrument.ticker) }),
  }))).sort((a, b) => b.result.asOf.localeCompare(a.result.asOf) || a.instrument.ticker.localeCompare(b.instrument.ticker));
}
export function fixtureBenchmark(): OHLCV[] {
  return Array.from({length: 100}, (_, day) => {
    const close = 100 + day * 0.11 + Math.sin(day / 8) * 1.4;
    const date = new Date(Date.UTC(2025, 4, 1 + day)).toISOString().slice(0, 10);
    return { date, open: close - 0.3, high: close + 0.7, low: close - 0.8, close, volume: 1_000_000 };
  });
}
