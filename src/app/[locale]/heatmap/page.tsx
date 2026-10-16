import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import Link from "next/link";
import { AppPageHead, HeadDisclosure, MetaChip, appPageClass } from "@/components/app-page-head";
import { latestScores } from "@/data/store";
import { aggregateSectors, intensity, metrics, parseMetric, type HeatMetric } from "@/heatmap/aggregate";
import { fill, formatDate, getMessages, intlTag, type Locale } from "@/i18n";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { pageMetadata } from "@/i18n/metadata";
import { sectorLabel } from "@/i18n/score-text";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./heatmap.module.css";

export const dynamic = "force-dynamic";

type Props = LocaleParams & { searchParams?: Promise<{ metric?: string | string[] }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const h = getHeatmapMessages(locale);
  return pageMetadata(locale, "/heatmap", h.metaTitle, h.metaDescription);
}

/** Signed percent with the locale's own sign and decimal mark, e.g. +4.2 % or −3,1 %. Rules share is unsigned. */
function label(locale: Locale, metric: HeatMetric, value: number): string {
  return new Intl.NumberFormat(intlTag[locale], { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: metric === "rules" ? "never" : "exceptZero" }).format(value / 100);
}

function tone(metric: HeatMetric, value: number | null): string {
  if (value === null) return styles.none;
  const step = intensity(metric, value);
  if (metric === "rules") return styles[`seq${step}`];
  return step === 0 ? styles.flat : styles[`${value > 0 ? "up" : "down"}${step}`];
}

async function Heatmap({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const h = getHeatmapMessages(locale);
  const metric = parseMetric((await searchParams)?.metric);
  const data = await latestScores();
  const sectors = aggregateSectors(data.rows, metric);
  const session = data.rows.map((row) => row.result.asOf).sort().at(-1) ?? "";
  const note = metric === "1m" ? h.note1m : metric === "3m" ? h.note3m : h.noteRules;
  const swatchSteps = metric === "rules" ? ["seq0", "seq1", "seq2", "seq3", "seq4"] : ["down4", "down3", "down2", "down1", "flat", "up1", "up2", "up3", "up4"];
  return <div className={appPageClass}>
    <AppPageHead title={h.title} sample={data.sample} sampleText={m.common.sample} lede={h.lede}
      meta={session ? <MetaChip>{fill(h.asOf, { date: formatDate(locale, session) })}</MetaChip> : undefined}
      actions={<><Link className="button secondary" href={`/${locale}/dashboard`}>{m.nav.dashboard}</Link><Link className="button secondary" href={`/${locale}/scanner`}>{m.nav.scanner}</Link></>} />
    <HeadDisclosure text={m.common.operatorDisclosure} />
    <div className={styles.toolbar}>
      <nav aria-label={h.metricLabel} className={styles.toggle}>
        <span className={styles.toggleLabel}>{h.metricLabel}</span>
        <span className={styles.options}>{metrics.map((key) => <Link key={key} href={`/${locale}/heatmap?metric=${key}`} aria-current={key === metric ? "true" : undefined} className={styles.option}>{h.metrics[key]}</Link>)}</span>
      </nav>
      <div className={styles.scale} aria-hidden="true">
        <span className={styles.scaleEnd}>{metric === "rules" ? h.scale.low : h.scale.down}</span>
        <span className={styles.swatches}>{swatchSteps.map((step) => <span key={step} className={`${styles.swatch} ${styles[step]}`} />)}</span>
        <span className={styles.scaleEnd}>{metric === "rules" ? h.scale.high : h.scale.up}</span>
        <span className={styles.swatches}><span className={`${styles.swatch} ${styles.none}`} /></span>
        <span className={styles.scaleEnd}>{h.scale.none}</span>
      </div>
      <p className={styles.note}>{note}</p>
    </div>
    {sectors.length === 0 ? <p className={styles.emptyCard}>{h.empty}</p> : <div className={styles.wrap}><ul className={styles.grid}>
      {sectors.map((sector) => <li key={sector.sector} className={`${styles.sector} ${sector.cells.length >= 7 ? styles.wide : ""}`}>
        <div className={styles.sectorHead}>
          <h2 className={styles.sectorName}>{sectorLabel(locale, sector.sector)}</h2>
          <p className={`${styles.average} ${tone(metric, sector.average)}`}>
            <span className={styles.averageLabel}>{h.average}</span>
            <strong>{sector.average === null ? h.noValue : label(locale, metric, sector.average)}</strong>
          </p>
        </div>
        <p className={styles.meta}>{fill(h.tickers, { n: sector.counted, total: sector.cells.length })}</p>
        {sector.counted === 0 && <p className={styles.meta}>{h.sectorEmpty}</p>}
        <ul className={styles.tiles}>
          {sector.cells.map((cell) => <li key={cell.ticker}>
            <Link href={`/${locale}/company/${cell.ticker}`} className={`${styles.tile} ${tone(metric, cell.value)}`} title={cell.name}>
              <span className={styles.ticker}>{cell.ticker}</span>
              <span className={styles.value}>{cell.value === null ? h.noValue : label(locale, metric, cell.value)}</span>
            </Link>
          </li>)}
        </ul>
      </li>)}
    </ul></div>}
    <section className={styles.legend} aria-labelledby="heatmap-legend">
      <h2 id="heatmap-legend" className={styles.legendTitle}>{h.legendTitle}</h2>
      <p>{metric === "rules" ? h.legendRules : h.legendPrice}</p>
      <p className={styles.meta}>{h.scope}</p>
      <p className={styles.meta}>{m.common.disclaimer}</p>
    </section>
  </div>;
}

export default withPageLog("/heatmap", Heatmap);
