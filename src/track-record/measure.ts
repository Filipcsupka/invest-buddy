export const WINDOWS = [30, 90, 180] as const;
export type WindowDays = (typeof WINDOWS)[number];
export type Close = { date: string; close: number };

/** The first common trading close on or after the calendar target is the exit. */
export function forwardReturn(signal: { asOf: string; tickerClose: number | null; spyClose: number | null },
  tickerBars: Close[], spyBars: Close[], days: WindowDays, today: string) {
  const target = new Date(Date.parse(`${signal.asOf}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  if (today < target || !(signal.tickerClose && signal.tickerClose > 0) || !(signal.spyClose && signal.spyClose > 0)) return null;
  const spyByDate = new Map(spyBars.filter((bar) => bar.date >= target && bar.date <= today).map((bar) => [bar.date, bar.close]));
  const exit = tickerBars.find((bar) => bar.date >= target && bar.date <= today && bar.close > 0 && (spyByDate.get(bar.date) ?? 0) > 0);
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
