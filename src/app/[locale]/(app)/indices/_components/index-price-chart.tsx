"use client";

import { useState } from "react";
import type { Locale } from "@/i18n";
import { Chart } from "@/components/chart";
import type { IndexBar } from "@/markets/index-analytics";
import { indexMessages } from "@/i18n/index-messages";
import { formatNumber } from "@/i18n";
import s from "./index-pages.module.css";

const periods = [1, 3, 5] as const;
function drawdownSeries(bars: IndexBar[]): number[] {
  let peak = 0;
  return bars.map((bar) => { peak = Math.max(peak, bar.close); return peak > 0 ? (bar.close / peak - 1) * 100 : 0; });
}
export function IndexPriceChart({ bars, locale, name }: { bars: IndexBar[]; locale: Locale; name: string }) {
  const [years, setYears] = useState<(typeof periods)[number]>(1);
  const m = indexMessages(locale);
  const selected = bars.slice(-years * 252);
  const drawdowns = drawdownSeries(selected);
  const min = Math.min(-1, ...drawdowns);
  const path = drawdowns.map((value, index) => `${index ? "L" : "M"}${(index / Math.max(1, drawdowns.length - 1) * 1000).toFixed(2)} ${(value / min * 90 + 5).toFixed(2)}`).join(" ");
  return <div className={s.chartBlock}>
    <div className={s.periods} role="group" aria-label={m.priceHistory}>{periods.map((period) => <button key={period} type="button" aria-pressed={years === period} onClick={() => setYears(period)}>{period === 1 ? m.year1 : period === 3 ? m.year3 : m.year5}</button>)}</div>
    {bars.length > 1 ? <><Chart bars={bars.map((bar) => ({ date: bar.date, close: bar.close, open: bar.close, high: bar.high ?? bar.close, low: bar.low ?? bar.close, volume: 0 }))} locale={locale} count={years * 252} dipZone={false} averages labels={{ name, aria: m.chartAria, close: m.close, ma50: "MA50", ma200: "MA200", dip: "", last: "{value}" }} />
      <div className={s.drawdown}><div className={s.drawdownHead}><strong>{m.drawdownStrip}</strong><span className="num">{formatNumber(locale, drawdowns.at(-1) ?? 0, 1)} %</span></div><svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`${m.drawdownStrip}: ${formatNumber(locale, drawdowns.at(-1) ?? 0, 1)} %`}><line x1="0" y1="5" x2="1000" y2="5" /><path d={path} /></svg></div>
    </> : <p>{m.noBars}</p>}
  </div>;
}
