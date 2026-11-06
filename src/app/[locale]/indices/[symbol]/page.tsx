import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetDetail, indexComponents, vendorSymbolFor } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { fill } from "@/i18n";
import { RecordCard } from "@/components/record-parts";
import t from "@/components/etf/etf.module.css";
import { resolveLocale } from "../../locale";
import { AssetDetailPage } from "../_components/asset-pages";
import { day, percentOf } from "../_components/format";
import s from "../_components/markets.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; symbol: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  const code = (await params).symbol.toUpperCase();
  return { ...pageMetadata(locale, `/indices/${encodeURIComponent(code)}`, `${code} · ${m.indices.title}`, m.indices.detailLede), robots: { index: false, follow: false } };
}
async function IndexPage({ params }: Props) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const vendor = vendorSymbolFor("index", (await params).symbol);
  const detail = vendor ? await assetDetail("index", vendor) : null;
  if (!vendor || !detail) notFound();
  const m = getMarketsMessages(locale);
  const components = await indexComponents(vendor);
  const weighted = components.rows.some((row) => row.weight !== null);
  return <AssetDetailPage locale={locale} assetClass="index" detail={detail} lede={m.indices.detailLede} basePath="indices">
    <RecordCard id="components" title={m.indices.components} lede={components.asOf ? fill(m.indices.componentsLede, { date: day(locale, components.asOf) }) : undefined}
      meta={components.rows.length ? <span className="num">{fill(m.indices.count, { n: components.rows.length })}</span> : undefined} flush={components.rows.length > 0}>
      {components.rows.length ? <>
        {weighted ? null : <p className={t.note}>{m.indices.weightMissing}</p>}
        <div className={t.tableWrap}><table className={t.table}>
          <caption className="visually-hidden">{m.indices.components}</caption>
          <thead><tr><th scope="col">{m.indices.code}</th><th scope="col">{m.name}</th><th scope="col">{m.indices.sector}</th><th scope="col">{m.indices.industry}</th>
            {weighted ? <th scope="col" className={s.right}>{m.indices.weight}</th> : null}</tr></thead>
          <tbody>{components.rows.map((row) => <tr key={row.code}>
            <th scope="row">{row.code}{row.exchange ? <span className={s.code}>{row.exchange}</span> : null}</th>
            <td>{row.name ?? m.noValue}</td><td>{row.sector ?? m.noValue}</td><td>{row.industry ?? m.noValue}</td>
            {weighted ? <td className={s.right}>{percentOf(locale, row.weight)}</td> : null}
          </tr>)}</tbody>
        </table></div>
      </> : <p className={t.note}>{m.indices.componentsNone}</p>}
    </RecordCard>
  </AssetDetailPage>;
}
export default withPageLog("/indices/[symbol]", IndexPage);
