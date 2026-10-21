import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { etfOutcomes, summarizeEtfOutcomes } from "@/db/etf";
import { getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { formatNumber } from "@/i18n";
import { RecordHead, RecordCard } from "@/components/record-parts";
import { signedPercent } from "@/components/etf/format";
import s from "@/components/etf/etf.module.css";
import { resolveLocale, type LocaleParams } from "../../locale";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  return pageMetadata(locale, "/etf/track-record", m.recordTitle, m.recordLede);
}
async function EtfTrackRecord({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  const { outcomes, sample } = await etfOutcomes();
  const summary = summarizeEtfOutcomes(outcomes);
  return <div className="frame page">
    <RecordHead title={m.recordTitle} lede={m.recordLede} stamp={sample ? <span className="stamp">{m.sample}</span> : undefined} actions={<Link className="button secondary" href={`/${locale}/etf`}>{m.back}</Link>} />
    <p className="notice">{m.smallSample}</p>
    {!summary.some((row) => row.count) ? <p className="notice">{m.noOutcomes}</p> : <RecordCard id="etf-record" title={m.outcomes}><div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">{m.horizon}</th><th scope="col">{m.count}</th><th scope="col">{m.mean}</th><th scope="col">{m.median}</th><th scope="col">{m.hitRate}</th></tr></thead><tbody>{summary.map((row) => <tr key={row.horizonDays}><td>{row.horizonDays} {m.days}</td><td>{formatNumber(locale, row.count)}</td><td>{signedPercent(locale, row.meanExcess)}</td><td>{signedPercent(locale, row.medianExcess)}</td><td>{row.hitRate === null ? m.noValue : `${formatNumber(locale, row.hitRate * 100, 1)} %`}</td></tr>)}</tbody></table></div></RecordCard>}
  </div>;
}
export default withPageLog("/etf/track-record", EtfTrackRecord);
