import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { etfList, type EtfAssetClass, type EtfCall } from "@/db/etf";
import { getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { formatNumber } from "@/i18n";
import { RecordHead } from "@/components/record-parts";
import { CallBadge, VerificationBadge, amount, displayedDate, percent } from "@/components/etf/format";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "../locale";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<{ assetClass?: string; call?: string }> };
const classes: EtfAssetClass[] = ["equity", "bond", "commodity", "multi_asset", "other"];
const calls: EtfCall[] = ["BUY_ZONE", "WATCH", "AVOID"];
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  return pageMetadata(locale, "/etf", m.title, m.lede);
}
async function EtfPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  const query = await searchParams;
  const assetClass = classes.find((item) => item === query?.assetClass);
  const call = calls.find((item) => item === query?.call);
  const { picks, run, sample } = await etfList();
  const filtered = picks.filter((pick) => (!assetClass || pick.assetClass === assetClass) && (!call || pick.call === call));
  const grouped = classes.map((item) => ({ assetClass: item, picks: filtered.filter((pick) => pick.assetClass === item) })).filter((group) => group.picks.length);
  return <div className="frame page">
    <RecordHead title={m.title} lede={m.lede} stamp={sample ? <span className="stamp">{m.sample}</span> : undefined} actions={<Link className="button secondary" href={`/${locale}/etf/track-record`}>{m.trackRecord}</Link>} />
    <dl className={s.stats}><div className={s.stat}><dt>{m.lastRun}</dt><dd>{displayedDate(locale, run?.asOf ?? null)}</dd></div><div className={s.stat}><dt>{m.verifiedPicks}</dt><dd>{formatNumber(locale, picks.filter((pick) => pick.verificationStatus === "verified").length)}</dd></div></dl>
    <form className={s.filters} action={`/${locale}/etf`} method="get">
      <label>{m.assetClass}<select name="assetClass" defaultValue={assetClass ?? ""}><option value="">{m.allClasses}</option>{classes.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
      <label>{m.call}<select name="call" defaultValue={call ?? ""}><option value="">{m.allCalls}</option>{calls.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
      <button className="button secondary" type="submit">{m.apply}</button>
    </form>
    {!picks.length ? <p className="notice">{m.empty}</p> : !grouped.length ? <p className="notice">{m.noMatch}</p> : grouped.map((group) => <section key={group.assetClass} className={s.group} aria-labelledby={`etf-${group.assetClass}`}>
      <h2 id={`etf-${group.assetClass}`}>{m[group.assetClass]}</h2><div className={s.tableWrap}><table className={s.table}><thead><tr>
        <th scope="col">{m.symbol}</th><th scope="col">{m.name}</th><th scope="col">{m.call}</th><th scope="col">{m.conviction}</th><th scope="col">{m.ter}</th><th scope="col">{m.aum}</th><th scope="col">{m.domicile}</th><th scope="col">{m.price}</th><th scope="col">{m.priceDate}</th><th scope="col">{m.verification}</th><th scope="col">{m.lastSeen}</th>
      </tr></thead><tbody>{group.picks.map((pick) => <tr key={pick.symbol}>
        <th scope="row"><Link href={`/${locale}/etf/${encodeURIComponent(pick.symbol)}`}>{pick.symbol}</Link></th><td>{pick.name}</td><td><CallBadge call={pick.call} locale={locale} /></td><td>{pick.conviction === null ? m.noValue : `${pick.conviction}/5`}</td><td>{percent(locale, pick.terPct)}</td><td>{amount(locale, pick.aumUsdM, 1)}</td><td>{pick.domicile ?? m.noValue}</td><td>{pick.price === null ? m.noValue : `${amount(locale, pick.price, 2)} ${pick.priceCurrency ?? ""}`}</td><td>{displayedDate(locale, pick.priceAsOf)}</td><td><VerificationBadge status={pick.verificationStatus} locale={locale} /></td><td>{displayedDate(locale, pick.lastSeenAt)}</td>
      </tr>)}</tbody></table></div></section>)}
  </div>;
}
export default withPageLog("/etf", EtfPage);
