export const WINDOWS = [1, 5, 20, 60] as const;
export type WindowDays = (typeof WINDOWS)[number];
export type Close = { date: string; close: number };

/** Count completed trading sessions with a valid close for both the stock and SPY. */
export function forwardReturn(signal: { asOf: string; tickerClose: number | null; spyClose: number | null },
  tickerBars: Close[], spyBars: Close[], days: WindowDays, today: string) {
  if (!(signal.tickerClose && signal.tickerClose > 0) || !(signal.spyClose && signal.spyClose > 0)) return null;
  const spyByDate = new Map(spyBars.filter((bar) => bar.date > signal.asOf && bar.date <= today && bar.close > 0)
    .map((bar) => [bar.date, bar.close]));
  const common = tickerBars.filter((bar) => bar.date > signal.asOf && bar.date <= today && bar.close > 0 && spyByDate.has(bar.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const exit = common[days - 1];
  if (!exit) return null;
  const spyExit = spyByDate.get(exit.date)!;
  const stock = exit.close / signal.tickerClose - 1;
  const spy = spyExit / signal.spyClose - 1;
  return { date: exit.date, stock, spy, excess: stock - spy };
}

export function hitRate(excessReturns: (number | null)[]) {
  const measured = excessReturns.filter((value): value is number => value !== null);
  return { hits: measured.filter((value) => value > 0).length, n: measured.length,
    rate: measured.length ? measured.filter((value) => value > 0).length / measured.length : null };
}

export function scoreSignal(previous: string | null, current: string) {
  if (previous === current) return null;
  if (current === "Setup met (>=18)") return "SETUP";
  if (current === "Criteria broken") return "BROKEN";
  return null;
}

export function judgeSignal(action: string) {
  return ["START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "THESIS_BROKEN"].includes(action) ? action : null;
}
