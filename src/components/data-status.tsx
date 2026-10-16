import { fill, formatDate, getMessages, type Locale } from "@/i18n";
import { getDataStatusMessages } from "@/i18n/data-status-messages";
import { SectionHead } from "./kit";
import { COVERAGE_GUARD_PERCENT, DATASET_IDS, datasetState, type Coverage, type DatasetDates } from "@/data/data-freshness";

export interface DataStatusDetail {
  /** Newest stored date per dataset, from the cached freshness reader. */
  datasets: DatasetDates;
  /** Null when the ticker has no score yet. */
  coverage: Coverage | null;
  /** Fixed clock for tests. */
  now?: number;
}

export function DataStatusBlock({ locale, detail }: { locale: Locale; detail: DataStatusDetail }) {
  const t = getDataStatusMessages(locale);
  const { coverage } = detail;
  return (
    <section className="sheet-section check-block" aria-labelledby="data-status" data-data-status="">
      <SectionHead id="data-status" title={t.title} lede={t.note} rule="quiet" />
      <p className="coverage-line" data-coverage={coverage?.level ?? "noscore"}>
        {coverage ? (
          <>
            <span className="tag coverage-tag">{t.coverageLabel}: {t.level[coverage.level]}</span>{" "}
            <span className="coverage-main">{fill(t.coverage, { known: String(coverage.known), total: String(coverage.total) })}.</span>{" "}
            <span className="muted small">{fill(t.coveragePoints, { points: String(coverage.points), max: String(coverage.pointsMax), guard: String(coverage.guardPoints) })}</span>
            {coverage.level === "limited" && <> <span className="muted small">{fill(t.limitedNote, { percent: String(COVERAGE_GUARD_PERCENT) })}</span></>}
          </>
        ) : <span className="muted small">{t.noScore}</span>}
      </p>
      <ul className="check-list" data-dataset-list="">
        {DATASET_IDS.map((id) => {
          const date = detail.datasets[id];
          const state = datasetState(id, date, detail.now);
          return (
            <li key={id} className="check-row" data-dataset={id} data-state={state}>
              <span className="check-dot" data-dot={state} aria-hidden="true" />
              <span className="check-name"><strong>{t.datasets[id].label}</strong>: {t.state[state]}</span>
              <span className="check-value num">{date ? fill(t.updated, { date: formatDate(locale, date.slice(0, 10)) }) : null}</span>
              <span className="check-rule">{t.datasets[id].source}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DataStatus({ locale, lastUpdated, stale, detail }: { locale: Locale; lastUpdated: string | null; stale: boolean; detail?: DataStatusDetail | null }) {
  const m = getMessages(locale).common;
  return <>
    {!lastUpdated && <p className="notice">{m.noDataYet}</p>}
    {lastUpdated && <p className="muted small data-updated">{fill(m.lastUpdated, { date: formatDate(locale, lastUpdated) })}</p>}
    {stale && lastUpdated && <p className="notice" role="status">{fill(m.staleData, { date: formatDate(locale, lastUpdated) })}</p>}
    {detail && <DataStatusBlock locale={locale} detail={detail} />}
  </>;
}
