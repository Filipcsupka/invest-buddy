import type { OHLCV } from "@/engine";
import { fill, formatDate, formatNumber, formatPrice, type Locale } from "@/i18n";

type Labels = { name: string; aria: string; close: string; ma50: string; ma200: string; dip: string; last: string };

const W = 1000;
const H = 400;

function movingAverages(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  closes.forEach((close, i) => {
    sum += close;
    if (i >= period) sum -= closes[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  });
  return out;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => span / s <= count + 1) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function path(points: (readonly [number, number] | null)[]): string {
  let d = "";
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

/**
 * Close, MA50 and MA200 over the last `count` sessions, with the 5 to 10%
 * dip zone under the 20-session high. Moving averages use the full history,
 * so each line starts at the first plotted session where its window is full.
 */
export function Chart({ bars, locale, labels, count = 100, dipZone = true, animate = false, averages = true }: { bars: OHLCV[]; locale: Locale; labels: Labels; count?: number; dipZone?: boolean; animate?: boolean; averages?: boolean }) {
  const closes = bars.map((bar) => bar.close);
  const ma50 = averages ? movingAverages(closes, 50) : closes.map(() => null);
  const ma200 = averages ? movingAverages(closes, 200) : closes.map(() => null);
  const start = Math.max(0, bars.length - count);
  const view = bars.slice(start);
  if (view.length < 2) return null;

  const recent = bars.slice(-20);
  const high20 = recent.length >= 20 ? Math.max(...recent.map((bar) => bar.high)) : null;
  const zone = dipZone && high20 !== null ? { top: high20 * 0.95, bottom: high20 * 0.9 } : null;

  const shown = [...view.map((bar) => bar.close), ...ma50.slice(start).filter((v): v is number => v !== null), ...ma200.slice(start).filter((v): v is number => v !== null), ...(zone ? [zone.bottom, high20 as number] : [])];
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const pad = (hi - lo) * 0.06 || 1;
  const min = lo - pad;
  const max = hi + pad;

  const x = (i: number) => (i / (view.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const series = (values: (number | null)[]) => path(values.slice(start).map((v, i) => (v === null ? null : ([x(i), y(v)] as const))));

  const closePath = series(closes);
  const ma50Path = series(ma50);
  const ma200Path = series(ma200);
  const hasMa50 = ma50Path !== "";
  const hasMa200 = ma200Path !== "";
  const ticks = niceTicks(min, max);
  const decimals = max - min < 20 ? 1 : 0;
  const last = view[view.length - 1];
  const dateMarks = [0, Math.floor((view.length - 1) / 2), view.length - 1];
  const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
  const aria = fill(labels.aria, { name: labels.name, count: view.length, first: formatDate(locale, view[0].date), last: formatDate(locale, last.date) });

  return (
    <figure className="chart">
      <div className="chart-plot" role="img" aria-label={aria}>
        <svg className="chart-layer" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {ticks.map((tick) => (
            <line key={tick} x1="0" x2={W} y1={y(tick)} y2={y(tick)} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {zone ? (
            <g className="chart-zone">
              <rect x={x(view.length - recent.length)} width={x(view.length - 1) - x(view.length - recent.length)} y={y(zone.top)} height={y(zone.bottom) - y(zone.top)} />
              <line x1={x(view.length - recent.length)} x2={W} y1={y(zone.top)} y2={y(zone.top)} vectorEffect="non-scaling-stroke" />
              <line x1={x(view.length - recent.length)} x2={W} y1={y(zone.bottom)} y2={y(zone.bottom)} vectorEffect="non-scaling-stroke" />
            </g>
          ) : null}
        </svg>
        <svg className={animate ? "chart-layer chart-lines is-plotting" : "chart-layer chart-lines"} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {hasMa200 ? <path d={ma200Path} className="line-ma200" vectorEffect="non-scaling-stroke" /> : null}
          {hasMa50 ? <path d={ma50Path} className="line-ma50" vectorEffect="non-scaling-stroke" /> : null}
          <path d={closePath} className="line-close" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="chart-last" style={{ top: pct(y(last.close), H) }} aria-hidden="true" />
        <div className="chart-y" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: pct(y(tick), H) }}>
              {formatNumber(locale, tick, decimals)}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {dateMarks.map((i) => (
          <span key={i} style={{ left: pct(i, view.length - 1) }}>
            {formatDate(locale, view[i].date, "short")}
          </span>
        ))}
      </div>
      <figcaption className="chart-legend">
        <span className="legend-item">
          <svg width="22" height="8" aria-hidden="true">
            <line x1="0" x2="22" y1="4" y2="4" className="line-close" />
          </svg>
          {labels.close} <span className="num legend-value">{fill(labels.last, { value: formatPrice(locale, last.close) })}</span>
        </span>
        {hasMa50 ? (
          <span className="legend-item">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" x2="22" y1="4" y2="4" className="line-ma50" />
            </svg>
            {labels.ma50}
          </span>
        ) : null}
        {hasMa200 ? (
          <span className="legend-item">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" x2="22" y1="4" y2="4" className="line-ma200" />
            </svg>
            {labels.ma200}
          </span>
        ) : null}
        {zone ? (
          <span className="legend-item">
            <svg width="22" height="10" aria-hidden="true" className="chart-zone">
              <rect x="0" y="1" width="22" height="8" />
            </svg>
            {labels.dip}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
