import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetSummaries, crossMatrix } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { formatNumber } from "@/i18n";
import { RecordCard } from "@/components/record-parts";
import t from "@/components/etf/etf.module.css";
import { resolveLocale, type LocaleParams } from "../locale";
import { AssetListPage } from "../indices/_components/asset-pages";
import s from "../indices/_components/markets.module.css";

export const dynamic = "force-dynamic";
const MATRIX = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  return { ...pageMetadata(locale, "/forex", m.forex.title, m.forex.lede), robots: { index: false, follow: false } };
}
async function ForexPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getMarketsMessages(locale);
  const rows = await assetSummaries("fx");
  const matrix = crossMatrix(rows, MATRIX);
  const shown = matrix.some((line, i) => line.some((cell, j) => i !== j && cell.value !== null));
  return <AssetListPage locale={locale} title={m.forex.title} lede={m.forex.lede} caption={m.forex.table} basePath="forex" rows={rows}>
    {shown ? <RecordCard id="cross" title={m.forex.matrix} lede={m.forex.matrixLede} flush>
      <div className={t.tableWrap}><table className={`${t.table} ${s.matrix}`}>
        <caption className="visually-hidden">{m.forex.matrixCaption}</caption>
        <thead><tr><td />{MATRIX.map((code) => <th key={code} scope="col" className={s.right}>{code}</th>)}</tr></thead>
        <tbody>{matrix.map((line, i) => <tr key={MATRIX[i]}><th scope="row">{MATRIX[i]}</th>{line.map((cell, j) => <td key={MATRIX[j]} className={s.right}>
          {i === j ? "—" : cell.value === null ? m.noValue : <>{formatNumber(locale, cell.value, cell.value >= 20 ? 2 : 4)}{cell.derived ? <abbr title={m.forex.derived}>*</abbr> : null}</>}
        </td>)}</tr>)}</tbody>
      </table></div>
    </RecordCard> : null}
  </AssetListPage>;
}
export default withPageLog("/forex", ForexPage);
