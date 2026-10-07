import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SampleStamp } from "@/components/operator-disclosure";
import { ownerAllocation, ownerViewEnabled } from "@/data/owner-allocation";
import { fill, formatDate, formatNumber, getMessages } from "@/i18n";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./owner-allocation.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: getMessages(locale).ownerAllocation.title, robots: { index: false, follow: false } };
}

export default async function OwnerAllocationPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  if (!ownerViewEnabled()) notFound();
  const m = getMessages(locale).ownerAllocation;
  const data = await ownerAllocation();
  const euro = (value: number) => `${formatNumber(locale, value, 2)} EUR`;
  return <article className="frame page">
    <header className="page-head">
      <div className="page-title-row"><h1 className="title">{m.title}</h1>{data.sample && <SampleStamp text={getMessages(locale).common.sample} />}</div>
      <p className="lede">{m.lede}</p>
      <p className="notice">{m.disclaimer}</p>
    </header>
    {!data.baseline || !data.result ? <p className="empty-line">{m.noBaseline}</p> : <>
      <section className="sheet-section" aria-labelledby="owner-cash">
        <div className="section-head"><h2 id="owner-cash">{m.cashTitle}</h2><p className="muted small">{fill(m.asOf, { date: formatDate(locale, data.baseline.asOf) })}</p></div>
        <dl className={styles.summary}>
          <div><dt>{m.monthly}</dt><dd>{data.baseline.monthlyContributionEur == null ? m.unknown : euro(data.baseline.monthlyContributionEur)}</dd></div>
          <div><dt>{m.freeCash}</dt><dd>{euro(data.baseline.cashEur)}</dd></div>
          <div><dt>{m.reserve}</dt><dd>{euro(data.result.reserveEur)}</dd></div>
          <div><dt>{m.carried}</dt><dd>{euro(data.result.carriedCashEur)}</dd></div>
        </dl>
        {data.result.cashDrag && <p className="notice">{m.cashDrag}</p>}
        {data.baseline.monthlyContributionEur == null && <p className="muted small">{m.monthlyMissing}</p>}
      </section>
      <section className="sheet-section" aria-labelledby="owner-suggestions">
        <h2 id="owner-suggestions">{m.suggestions}</h2>
        {data.result.suggestions.length ? <div className="table-scroll"><table className="screen">
          <thead><tr><th scope="col">{m.symbol}</th><th scope="col">{m.tier}</th><th scope="col">{m.amount}</th><th scope="col">{m.reason}</th></tr></thead>
          <tbody>{data.result.suggestions.map((suggestion) => <tr key={`${suggestion.symbol}-${suggestion.tier}`}>
            <th scope="row">{suggestion.symbol}</th><td>{m.tiers[suggestion.tier]}</td><td className="num">{suggestion.amountEur ? euro(suggestion.amountEur) : m.wait}</td><td>{m.reasons[suggestion.reason]}{suggestion.capped ? ` ${m.capped}` : ""}</td>
          </tr>)}</tbody>
        </table></div> : <p className="empty-line">{m.noSignals}</p>}
        <p className="muted small">{m.historyNote}</p>
      </section>
    </>}
  </article>;
}
