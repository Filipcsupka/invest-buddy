import type { CSSProperties } from "react";
import type { Locale } from "@/i18n";
import { CountUp } from "./count-up";

export interface RuleScanRow {
  id: string;
  name: string;
  /** Points the rule is worth. */
  max: number;
  result: "pass" | "fail" | "none";
  /** Spoken result, for example "Met", "Not met" or "No data". */
  word: string;
}

export interface RuleScanProps {
  rows: RuleScanRow[];
  /** Score in percent, or null when there is none. */
  percent: number | null;
  locale: Locale;
  stateLabel: string;
  /** Caption under the score, for example "of points with data". */
  caption: string;
  /** Heading above the rows, for example "Rule scan". */
  title: string;
  noDataLabel: string;
  describedBy?: string;
  state?: string;
}

/**
 * A scan plate: a sweep passes over the nine core rules once on load and a sonar ring pings each rule that is met.
 * Every row keeps its name, points and result as text, so the plate is the full rule list in small, not only marks.
 */
export function RuleScan({ rows, percent, locale, stateLabel, caption, title, noDataLabel, describedBy, state }: RuleScanProps) {
  return (
    <section className="kit-scan" aria-label={title} aria-describedby={describedBy} data-state={state}>
      <span className="kit-scan-sweep" aria-hidden="true" />
      <header className="kit-scan-head">
        <p className="kit-scan-title">{title}</p>
        <p className="kit-scan-score">
          {percent === null ? <span className="kit-scan-none">{noDataLabel}</span> : <CountUp value={Math.round(percent)} locale={locale} format="percent" motion="load" />}
          <span className="kit-scan-state">{stateLabel}</span>
        </p>
        <p className="kit-scan-caption">{caption}</p>
      </header>
      <ol className="kit-scan-list">
        {rows.map((row, index) => (
          <li key={row.id} data-result={row.result} style={{ "--i": index } as CSSProperties}>
            <a href={`#rule-${row.id}`}>
              <span className="kit-scan-ping" aria-hidden="true"><i /></span>
              <span className="kit-scan-name">{row.name}</span>
              <span className="kit-scan-pts num">{row.result === "none" ? noDataLabel : row.result === "pass" ? `+${row.max}` : `0 / ${row.max}`}</span>
              <span className="visually-hidden">{row.word}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
