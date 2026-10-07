import type { IndexedPoint } from "@/portfolio/history";
import { formatDate, formatNumber, type Locale } from "@/i18n";

/** Index values are 100 on the first date. The chart shows them as percent change, so zero is the starting line. */
const W = 800;
const H = 300;
const PAD = { left: 56, right: 16, top: 16, bottom: 32 };

export interface ChartSummary {
  portfolioPct: number;
  benchmarkPct: number | null;
  diffPct: number | null;
  maxDrawdownPct: number;
  drawdownDate: string | null;
}

/** Largest fall from a running peak in the portfolio index, in percent (zero or negative). */
export function summarize(points: IndexedPoint[]): ChartSummary | null {
  const last = points.at(-1);
  if (!last) return null;
  let peak = points[0].portfolio;
  let worst = 0;
  let worstDate: string | null = null;
  for (const point of points) {
    peak = Math.max(peak, point.portfolio);
    const fall = (point.portfolio / peak - 1) * 100;
    if (fall < worst) { worst = fall; worstDate = point.date; }
  }
  const portfolioPct = last.portfolio - 100;
  const benchmarkPct = last.benchmark != null ? last.benchmark - 100 : null;
  return { portfolioPct, benchmarkPct, diffPct: benchmarkPct != null ? portfolioPct - benchmarkPct : null, maxDrawdownPct: worst, drawdownDate: worstDate };
}

function niceStep(range: number): number {
  const raw = range / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function signed(locale: Locale, value: number, digits = 2): string {
  const text = formatNumber(locale, Math.abs(value), digits);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text} %`;
}

export function tone(value: number | null): "gain" | "loss" | "flat" {
  return value == null || Math.abs(value) < 0.005 ? "flat" : value > 0 ? "gain" : "loss";
}

export function PerformanceKpis({ locale, summary, text }: { locale: Locale; summary: ChartSummary; text: { current: string; benchmark: string; difference: string; drawdown: string; ahead: string; behind: string; since: string } }) {
  const diff = summary.diffPct;
  return (
    <div className="kpi-row" role="group" aria-label={text.current}>
      <div className="kpi kpi-main" data-tone={tone(summary.portfolioPct)}>
        <span className="kpi-label">{text.current}</span>
        <span className="kpi-value num">{signed(locale, summary.portfolioPct)}</span>
        <span className="kpi-sub">{text.since}</span>
      </div>
      {summary.benchmarkPct != null && (
        <div className="kpi" data-tone={tone(summary.benchmarkPct)}>
          <span className="kpi-label">{text.benchmark}</span>
          <span className="kpi-value num">{signed(locale, summary.benchmarkPct)}</span>
        </div>
      )}
      {diff != null && (
        <div className="kpi" data-tone={tone(diff)}>
          <span className="kpi-label">{text.difference}</span>
          <span className="kpi-value num">{`${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatNumber(locale, Math.abs(diff), 2)} pp`}</span>
          <span className="kpi-sub">{diff > 0 ? text.ahead : diff < 0 ? text.behind : ""}</span>
        </div>
      )}
      <div className="kpi" data-tone={summary.maxDrawdownPct < -0.005 ? "loss" : "flat"}>
        <span className="kpi-label">{text.drawdown}</span>
        <span className="kpi-value num">{signed(locale, summary.maxDrawdownPct)}</span>
        {summary.drawdownDate && <span className="kpi-sub">{formatDate(locale, summary.drawdownDate)}</span>}
      </div>
    </div>
  );
}

export function PerformanceChart({ locale, points, label }: { locale: Locale; points: IndexedPoint[]; label: string }) {
  const portfolio = points.map((p) => p.portfolio - 100);
  const bench = points.map((p) => (p.benchmark != null ? p.benchmark - 100 : null));
  const all = [0, ...portfolio, ...bench.filter((v): v is number => v != null)];
  const step = niceStep(Math.max(1, Math.max(...all) - Math.min(...all)));
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const t0 = Date.parse(points[0].date);
  const span = Math.max(1, Date.parse(points.at(-1)!.date) - t0);
  const x = (date: string) => PAD.left + ((Date.parse(date) - t0) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const zeroY = y(0);

  const line = (values: (number | null)[]) => points.flatMap((p, i) => (values[i] == null ? [] : [`${x(p.date).toFixed(1)},${y(values[i]!).toFixed(1)}`])).map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`).join(" ");
  const area = `${line(portfolio)} L${x(points.at(-1)!.date).toFixed(1)},${zeroY.toFixed(1)} L${x(points[0].date).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const dateTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const clipAbove = `pc-above-${points.length}`;
  const clipBelow = `pc-below-${points.length}`;
  const lastP = points.at(-1)!;

  return (
    <div className="performance-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <clipPath id={clipAbove}><rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={zeroY} /></clipPath>
          <clipPath id={clipBelow}><rect x={PAD.left} y={zeroY} width={W - PAD.left - PAD.right} height={H - zeroY} /></clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "pc-zero" : "pc-grid"} />
            <text x={PAD.left - 8} y={y(tick)} className={tick === 0 ? "pc-axis pc-axis-zero" : "pc-axis"} textAnchor="end" dominantBaseline="middle">{`${tick > 0 ? "+" : tick < 0 ? "−" : ""}${formatNumber(locale, Math.abs(tick), step < 1 ? 1 : 0)} %`}</text>
          </g>
        ))}
        <path d={area} className="pc-area-gain" clipPath={`url(#${clipAbove})`} />
        <path d={area} className="pc-area-loss" clipPath={`url(#${clipBelow})`} />
        {bench.some((v) => v != null) && <path d={line(bench)} className="pc-line-bench" />}
        <path d={line(portfolio)} className="pc-line-portfolio" />
        <circle cx={x(lastP.date)} cy={y(portfolio.at(-1)!)} r={4} className="pc-dot" data-tone={tone(portfolio.at(-1)!)} />
        {dateTicks.map((i) => (
          <text key={i} x={x(points[i].date)} y={H - 8} className="pc-axis" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{formatDate(locale, points[i].date, "short")}</text>
        ))}
      </svg>
    </div>
  );
}
