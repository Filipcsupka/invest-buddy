import Link from "next/link";
import { CountUp } from "@/components/kit/count-up";
import { type HeatMetric, type HeatSector, type HeatSummary, sectorId } from "@/heatmap/aggregate";
import { formatNumber, type Locale } from "@/i18n";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { sectorLabel } from "@/i18n/score-text";
import styles from "./heatmap-bento.module.css";

function distribution(sector: HeatSector, metric: HeatMetric) {
  return <span className={styles.distribution} aria-hidden="true">
    {sector.cells.map((cell) => <span key={cell.ticker} className={cell.value === null ? styles.missing : metric === "rules" ? styles.rules : cell.value > 0 ? styles.up : cell.value < 0 ? styles.down : styles.flat} />)}
  </span>;
}

function sectorTile(locale: Locale, metric: HeatMetric, sector: HeatSector | null, title: string, noValue: string) {
  if (!sector) return <div className={styles.tile}><span className={styles.kicker}>{title}</span><strong className={styles.name}>{noValue}</strong></div>;
  const value = sector.average;
  const sign = metric !== "rules" && value !== null ? value > 0 ? "+" : value < 0 ? "−" : "" : "";
  const direction = metric === "rules" ? "" : value === null ? "" : value > 0 ? "↑" : value < 0 ? "↓" : "•";
  const whole = value === null ? 0 : Math.trunc(Math.abs(value));
  const fraction = value === null ? "" : formatNumber(locale, Math.abs(value), 1).slice(formatNumber(locale, whole).length);
  return <Link className={styles.tile} href={`#${sectorId(sector.sector)}`}>
    <span className={styles.kicker}>{title}<span aria-hidden="true"> ↗</span></span>
    <strong className={styles.name}>{sectorLabel(locale, sector.sector)}</strong>
    <span className={styles.big} data-direction={value === null ? "none" : metric === "rules" ? "rules" : value > 0 ? "up" : value < 0 ? "down" : "flat"}>
      <span aria-hidden="true">{direction} </span>{value === null ? noValue : <>{sign}<CountUp value={whole} locale={locale} />{fraction}%</>}
    </span>
    {distribution(sector, metric)}
  </Link>;
}

export function HeatmapBento({ locale, metric, summary }: { locale: Locale; metric: HeatMetric; summary: HeatSummary }) {
  const copy = getHeatmapMessages(locale);
  const breadthHref = summary.breadthSector ? `#${sectorId(summary.breadthSector.sector)}` : undefined;
  const coverageHref = summary.coverageSector ? `#${sectorId(summary.coverageSector.sector)}` : undefined;
  const rules = metric === "rules";
  const positive = rules ? summary.metRules : summary.up;
  const negative = rules ? summary.knownRules - summary.metRules : summary.down;
  const denominator = rules ? summary.knownRules : summary.counted;
  const breadthParts = <>
    <span className={styles.kicker}>{copy.bento.breadth}<span aria-hidden="true"> ↗</span></span>
    <strong className={styles.big}>{denominator ? <><CountUp value={Math.round(positive / denominator * 100)} locale={locale} />%</> : copy.noValue}</strong>
    <span className={styles.split} aria-hidden="true"><span style={{ width: `${denominator ? positive / denominator * 100 : 0}%` }} /><span style={{ width: `${denominator ? negative / denominator * 100 : 0}%` }} /></span>
    <span className={styles.detail}>{rules ? copy.bento.rulesDetail.replace("{met}", formatNumber(locale, positive)).replace("{known}", formatNumber(locale, denominator)) : copy.bento.priceDetail.replace("{up}", formatNumber(locale, positive)).replace("{down}", formatNumber(locale, negative)).replace("{flat}", formatNumber(locale, summary.flat))}</span>
  </>;
  const coverageParts = <>
    <span className={styles.kicker}>{copy.bento.coverage}<span aria-hidden="true"> ↗</span></span>
    <strong className={styles.big}><CountUp value={summary.counted} locale={locale} /><span className={styles.of}> / {formatNumber(locale, summary.total)}</span></strong>
    <span className={styles.coverageBar} aria-hidden="true"><span style={{ width: `${summary.total ? summary.counted / summary.total * 100 : 0}%` }} /></span>
    <span className={styles.detail}>{copy.bento.coverageDetail.replace("{missing}", formatNumber(locale, summary.total - summary.counted))}</span>
  </>;
  return <nav className={styles.grid} aria-label={copy.bento.summary}>
    {sectorTile(locale, metric, summary.strongest, copy.bento.strongest, copy.noValue)}
    {sectorTile(locale, metric, summary.weakest, copy.bento.weakest, copy.noValue)}
    {breadthHref ? <Link className={styles.tile} href={breadthHref}>{breadthParts}<span className={styles.srOnly}>{copy.bento.viewSector.replace("{sector}", sectorLabel(locale, summary.breadthSector!.sector))}</span></Link> : <div className={styles.tile}>{breadthParts}</div>}
    {coverageHref ? <Link className={styles.tile} href={coverageHref}>{coverageParts}<span className={styles.srOnly}>{copy.bento.viewSector.replace("{sector}", sectorLabel(locale, summary.coverageSector!.sector))}</span></Link> : <div className={styles.tile}>{coverageParts}</div>}
  </nav>;
}
