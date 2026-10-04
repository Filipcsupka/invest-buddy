import Link from "next/link";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowRight } from "@/components/icons";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { StateChip } from "@/components/score-badge";
import { ScreenTable } from "@/components/screen-table";
import { byScore, toRow, type ScreenRow } from "@/components/view-model";
import { latestScores } from "@/data/store";
import { DataStatus } from "@/components/data-status";
export const dynamic = "force-dynamic";
import { fill, formatDate, getMessages, plural } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { resolveLocale, type LocaleParams } from "../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/dashboard", m.meta.dashboardTitle, m.meta.dashboardDescription);
}

export default async function Dashboard({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const data = await latestScores();
  const rows = data.rows.map((row) => toRow(locale, row)).sort(byScore);
  const groups = new Map<StateKey, ScreenRow[]>(stateOrder.map((key) => [key, rows.filter((row) => row.state === key)]));
  const session = rows.find((row) => row.date)?.date ?? "";
  const lower = [...(groups.get("wait") ?? []), ...(groups.get("ignore") ?? []), ...(groups.get("insufficient") ?? [])];

  const section = (key: "setup" | "watch" | "broken", columns: ("sector" | "score" | "state" | "reason")[]) => {
    const list = groups.get(key) ?? [];
    const id = `disclaimer-${key}`;
    return (
      <section className="board-section" aria-labelledby={`state-${key}`} key={key}>
        <div className="board-head">
          <h2 id={`state-${key}`}>
            <StateChip state={key} label={m.states[key]} />
            <span className="num board-count">{plural(locale, m.plurals.tickers, list.length)}</span>
          </h2>
          <p className="board-note">{m.dashboard.stateNotes[key]}</p>
        </div>
        {list.length ? (
          <ScreenTable locale={locale} rows={list} columns={["company", ...columns]} disclaimerId={id} caption={<Disclaimer text={m.common.disclaimer} id={id} compact />} />
        ) : (
          <p className="empty-line">{m.dashboard.empty}</p>
        )}
      </section>
    );
  };

  return (
    <div className="frame page">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.dashboard.title}</h1>
          {data.sample && <SampleStamp text={m.common.sample} />}
        </div>
        <p className="lede">{data.lastUpdated ? fill(m.dashboard.lede, { date: formatDate(locale, session), count: plural(locale, m.plurals.sampleTickers, rows.length) }) : m.common.noDataYet}</p>
        <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
        <OperatorDisclosure text={m.common.operatorDisclosure} />
      </header>

      <table className="tally">
        <caption className="visually-hidden">{m.dashboard.summaryLabel}</caption>
        <tbody>
          <tr>
            {stateOrder
              .filter((key) => key !== "insufficient" || (groups.get(key)?.length ?? 0) > 0)
              .map((key) => (
                <td key={key} data-state={key}>
                  <a href={key === "wait" || key === "ignore" || key === "insufficient" ? "#lower" : `#state-${key}`} className="tally-cell">
                    <span className="tally-label">{m.states[key]}</span>
                    <span className="num tally-count">{groups.get(key)?.length ?? 0}</span>
                  </a>
                </td>
              ))}
          </tr>
        </tbody>
      </table>

      {section("setup", ["sector", "score", "state"])}
      {section("watch", ["sector", "score", "state"])}
      {section("broken", ["score", "state", "reason"])}

      <section className="board-section" aria-labelledby="lower">
        <div className="board-head">
          <h2 id="lower">{m.dashboard.lowerTitle}</h2>
          <p className="board-note">{m.dashboard.lowerBody}</p>
        </div>
        <details className="disclosure-block">
          <summary>{fill(m.dashboard.showLower, { count: plural(locale, m.plurals.tickers, lower.length) })}</summary>
          <ScreenTable locale={locale} rows={lower} columns={["company", "sector", "score", "state"]} disclaimerId="disclaimer-lower" caption={<Disclaimer text={m.common.disclaimer} id="disclaimer-lower" compact />} />
        </details>
      </section>

      <p className="page-foot">
        <Link className="arrow-link" href={`/${locale}/scanner`}>
          {m.dashboard.scannerLink}
          <IconArrowRight />
        </Link>
      </p>
    </div>
  );
}
