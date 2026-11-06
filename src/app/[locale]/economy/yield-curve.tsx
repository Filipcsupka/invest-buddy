import type { CurveSnapshot } from "@/db/economy";
import { fill, formatDate, formatNumber, type Locale } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import styles from "./flow.module.css";

const W = 600, H = 240, PAD = { top: 12, right: 12, bottom: 28, left: 40 };

/**
 * Par yield by maturity: the latest stored curve and, dashed, the curve about a month earlier. Maturities are evenly spaced in tenor order.
 * Server-rendered SVG; the values are also in the rate table below it and in the accessible name.
 */
export function YieldCurve({ locale, latest, prior }: { locale: Locale; latest: CurveSnapshot; prior: CurveSnapshot | null }) {
  const m = getFlowMessages(locale).economy;
  const tenors = latest.points.map((point) => point.tenor);
  if (tenors.length < 2) return null;
  const priorByTenor = new Map(prior?.points.map((point) => [point.tenor, point.rate]) ?? []);
  const values = [...latest.points.map((point) => point.rate), ...tenors.flatMap((tenor) => priorByTenor.has(tenor) ? [priorByTenor.get(tenor)!] : [])];
  const low = Math.floor(Math.min(...values) * 4) / 4 - 0.25, high = Math.ceil(Math.max(...values) * 4) / 4 + 0.25;
  const x = (i: number) => PAD.left + (i / (tenors.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - low) / (high - low || 1)) * (H - PAD.top - PAD.bottom);
  const step = (high - low) / 4;
  const ticks = [0, 1, 2, 3, 4].map((n) => low + n * step);
  const line = (points: (readonly [number, number])[]) => points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
  const latestPath = line(latest.points.map((point, i) => [x(i), y(point.rate)] as const));
  const priorPoints = tenors.flatMap((tenor, i) => priorByTenor.has(tenor) ? [[x(i), y(priorByTenor.get(tenor)!)] as const] : []);
  const aria = fill(m.curveAria, { date: formatDate(locale, latest.date), points: latest.points.map((point) => `${point.tenor} ${formatNumber(locale, point.rate, 2)} %`).join(", ") });
  return (
    <figure className={styles.curve}>
      <div className={styles.curvePlot} role="img" aria-label={aria}>
        <svg className={styles.curveSvg} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {ticks.map((tick) => <g key={tick}>
            <line className={styles.grid} x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className={styles.axisLabel} x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">{formatNumber(locale, tick, 2)}</text>
          </g>)}
          {priorPoints.length > 1 ? <path className={styles.prior} d={line(priorPoints)} /> : null}
          <path className={styles.latest} d={latestPath} />
          {latest.points.map((point, i) => <circle key={point.tenor} className={styles.dot} cx={x(i)} cy={y(point.rate)} r={3.5} />)}
          {tenors.map((tenor, i) => (i % Math.ceil(tenors.length / 8) === 0 || i === tenors.length - 1)
            ? <text key={tenor} className={styles.axisLabel} x={x(i)} y={H - 8} textAnchor="middle">{tenor}</text> : null)}
        </svg>
      </div>
      <ul className={styles.legend}>
        <li><span className={styles.swatchLatest} aria-hidden="true" />{fill(m.curveLatest, { date: formatDate(locale, latest.date) })}</li>
        {prior && priorPoints.length > 1 ? <li><span className={styles.swatchPrior} aria-hidden="true" />{fill(m.curveMonth, { date: formatDate(locale, prior.date) })}</li> : null}
      </ul>
    </figure>
  );
}
