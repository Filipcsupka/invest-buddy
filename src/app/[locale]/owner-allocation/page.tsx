import { withPageLog } from "@/app/page-log";
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

async function OwnerAllocationPage({ params }: LocaleParams) {
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
          <div><dt>{m.recycled}</dt><dd>{euro(data.result.recycledCashEur ?? 0)}</dd></div>
        </dl>
        {data.result.cashDrag && <p className="notice">{m.cashDrag}</p>}
        {data.baseline.monthlyContributionEur == null && <p className="muted small">{m.monthlyMissing}</p>}
      </section>
      <section className="sheet-section" aria-labelledby="owner-suggestions">
        <h2 id="owner-suggestions">{m.suggestions}</h2>
        {data.result.suggestions.length ? <div className="table-scroll" role="region" tabIndex={0} aria-label={m.suggestions}><table className="screen">
          <thead><tr><th scope="col">{m.symbol}</th><th scope="col">{m.tier}</th><th scope="col">{m.amount}</th><th scope="col">{m.recycledUsed}</th><th scope="col">{m.reason}</th></tr></thead>
          <tbody>{data.result.suggestions.map((suggestion) => <tr key={`${suggestion.symbol}-${suggestion.tier}`}>
            <th scope="row">{suggestion.symbol}</th><td>{m.tiers[suggestion.tier]}</td><td className="num">{suggestion.amountEur ? euro(suggestion.amountEur) : m.wait}</td><td className="num">{euro(suggestion.recycledEur ?? 0)}</td><td>{m.reasons[suggestion.reason]}{suggestion.capped ? ` ${m.capped}` : ""}</td>
          </tr>)}</tbody>
        </table></div> : <p className="empty-line">{m.noSignals}</p>}
        <p className="muted small">{m.historyNote}</p>
      </section>
      {!!data.sales?.length && <section className="sheet-section" aria-labelledby="owner-sales"><h2 id="owner-sales">{m.sales}</h2><div className="table-scroll"><table className="screen"><thead><tr><th>{m.symbol}</th><th>{m.tradeDate}</th><th>{m.netProceeds}</th><th>{m.remainingProceeds}</th></tr></thead><tbody>{data.sales.map((sale, index) => <tr key={`${sale.date}-${sale.symbol}-${index}`}><th scope="row">{sale.symbol}</th><td>{formatDate(locale, sale.date)}</td><td className="num">{euro(sale.netProceedsEur)}</td><td className="num">{euro(sale.remainingEur)}</td></tr>)}</tbody></table></div></section>}
      {!!data.holdings?.length && <section className="sheet-section" aria-labelledby="owner-holdings"><h2 id="owner-holdings">{m.holdings}</h2><div className="table-scroll"><table className="screen"><thead><tr><th>{m.symbol}</th><th>{m.gainFromCost}</th><th>{m.daysHeld}</th></tr></thead><tbody>{data.holdings.map((holding) => <tr key={holding.symbol}><th scope="row">{holding.symbol}</th><td className="num">{holding.gainFromCostPercent == null ? m.unknown : `${formatNumber(locale, holding.gainFromCostPercent, 2)}%`}</td><td className="num">{holding.daysHeld ?? m.unknown}</td></tr>)}</tbody></table></div></section>}
    </>}
  </article>;
}

export default withPageLog("/owner-allocation", OwnerAllocationPage);
