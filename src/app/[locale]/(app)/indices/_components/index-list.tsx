"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n";
import { formatNumber } from "@/i18n";
import { indexMessages } from "@/i18n/index-messages";
import type { AssetSummary } from "@/db/markets";
import type { IndexPriceAnalytics } from "@/markets/index-analytics";
import type { IndexListRating } from "@/data/index-list";
import { day, level, signedRatio } from "./format";
import s from "./index-pages.module.css";

export type IndexListRow = {
  summary: AssetSummary;
  price: IndexPriceAnalytics | null;
  rating: IndexListRating | null;
  region: "americas" | "europe" | "asiaPacific" | "other";
};

export function indexRegion(code: string, country: string | null): IndexListRow["region"] {
  const c = (country ?? "").toLowerCase();
  if (/united states|canada|brazil|mexico|argentina/.test(c)) return "americas";
  if (/japan|china|hong kong|india|taiwan|korea|australia/.test(c)) return "asiaPacific";
  if (/germany|france|netherlands|switzerland|spain|united kingdom|europe/.test(c)) return "europe";
  if (["GSPC", "NDX", "DJI", "DJT", "DJU", "IXIC", "VIX", "GSPTSE", "BVSP", "MXX"].includes(code)) return "americas";
  if (["GDAXI", "FCHI", "STOXX50E", "AEX", "IBEX", "SSMI", "N100"].includes(code)) return "europe";
  if (["N225", "AXJO", "BSESN", "HSI", "KS11", "NSEI", "SSEC", "TWII"].includes(code)) return "asiaPacific";
  return "other";
}

const pct = (locale: Locale, value: number | null, digits = 0) => value === null ? null : `${formatNumber(locale, value, digits)} %`;

export function IndexList({ locale, rows }: { locale: Locale; rows: IndexListRow[] }) {
  const m = indexMessages(locale);
  const [region, setRegion] = useState("all");
  const shown = rows.filter((row) => region === "all" || row.region === region);
  return <section className={s.list} aria-labelledby="tracked-indices">
    <div className={s.sectionHead}><div><h2 id="tracked-indices">{m.tracked}</h2><p>{shown.length} / {rows.length}</p></div>
      <label className={s.filter}>{m.region}<select value={region} onChange={(event) => setRegion(event.target.value)}>
        <option value="all">{m.allRegions}</option><option value="americas">{m.americas}</option><option value="europe">{m.europe}</option><option value="asiaPacific">{m.asiaPacific}</option><option value="other">{m.other}</option>
      </select></label></div>
    {rows.length === 0 ? <p className={s.empty}>{m.noIndices}</p> : <>{rows.every((row) => row.summary.last === null) ? <p className={s.empty}>{m.noBars}</p> : null}<div className={s.tableWrap}><table className={s.table}>
      <caption className="visually-hidden">{m.tracked}</caption>
      <thead><tr><th scope="col">{m.name}</th><th scope="col">{m.rating}</th><th scope="col">{m.latestClose}</th><th scope="col">{m.d1}</th><th scope="col">{m.d5}</th><th scope="col">{m.m1}</th><th scope="col">{m.m3}</th><th scope="col">{m.ytd}</th><th scope="col">{m.y1}</th><th scope="col">{m.trend}</th><th scope="col">{m.drawdown}</th><th scope="col">{m.vol20}</th><th scope="col">{m.freshness}</th></tr></thead>
      <tbody>{shown.map(({ summary, price: p, rating }) => {
        const trend = p?.last !== null && p?.last !== undefined ? [p.ma50, p.ma200].flatMap((ma, i) => ma === null || ma === undefined ? [] : [`${p.last! >= ma ? m.above : m.below} ${i === 0 ? "MA50" : "MA200"}`]) : [];
        const vix = rating?.kind === "volatility";
        const label = vix ? (rating.regime ? m.regimes[rating.regime] : m.notEnough) : rating?.band ? m.bands[rating.band] : m.notEnough;
        return <tr key={summary.symbol}>
          <th scope="row"><Link href={`/${locale}/indices/${encodeURIComponent(summary.code)}`}>{summary.name}</Link><span className={s.sub}>{summary.code}{summary.currency && summary.currency !== "NA" ? ` · ${summary.currency}` : ""}</span></th>
          <td><strong className={s.band}>{label}</strong>{rating?.score !== null && rating?.score !== undefined ? <span className={s.sub}>{m.score} {rating.score}/100 · {rating.basisText?.[locale].label}</span> : null}{!vix && rating ? <span className={s.sub}>{m.coverage} {pct(locale, rating.coveragePct)} · {day(locale, rating.asOf)}</span> : null}</td>
          <td className="num">{p?.last != null ? level(locale, p.last) : summary.last !== null ? level(locale, summary.last) : ""}</td>
          {[p?.returns.d1 ?? summary.change1d, p?.returns.d5 ?? summary.change5d, p?.returns.m1, p?.returns.m3, p?.returns.ytd ?? summary.changeYtd, p?.returns.y1].map((value, i) => <td key={i} className="num">{value == null ? "" : signedRatio(locale, value)}</td>)}
          <td>{!vix && trend.length ? trend.join(" · ") : ""}</td><td className="num">{!vix && p?.drawdownFromHigh != null ? signedRatio(locale, p.drawdownFromHigh) : ""}</td>
          <td className="num">{!vix && p?.vol20 != null ? pct(locale, p.vol20 * 100, 1) : ""}</td><td className="num">{day(locale, p?.asOf ?? summary.lastDate)}</td>
        </tr>;
      })}</tbody>
    </table></div></>}
  </section>;
}
