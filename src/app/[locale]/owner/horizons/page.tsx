import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { flags } from "@/config/flags";
import { getPool } from "@/db/pool";
import { latestHorizonLabels } from "@/db/horizon-labels";
import { pageMetadata } from "@/i18n/metadata";
import { ownerAuthorized } from "../auth";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner/horizons", "Horizon labels", "Private horizon profile facts."), robots: { index: false, follow: false } };
}
export default async function OwnerHorizonsPage({ params }: Props) {
  if (!flags().OWNER_VIEW || !ownerAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const db = getPool();
  if (!db) notFound();
  const rows = await latestHorizonLabels(db, new Date().toISOString().slice(0, 10));
  const sk = locale === "sk";
  const value = (v: number | string | null | undefined) => v == null ? "—" : String(v);
  return <article className="frame page">
    <header className="page-head"><h1 className="title">{sk ? "Horizontové profily" : "Horizon profiles"}</h1>
      <p className="lede">{sk ? "Súkromný prehľad uložených profilov a vstupov." : "Private view of stored profiles and inputs."}</p></header>
    <section className="sheet-section" aria-label={sk ? "Profily" : "Profiles"}>
      <div className="table-wrap"><table><thead><tr>
        <th scope="col">Ticker</th><th scope="col">{sk ? "Dátum" : "As of"}</th><th scope="col">{sk ? "Profil" : "Profile"}</th>
        <th scope="col">YoY % ({sk ? "4 štvrťroky" : "4 quarters"})</th><th scope="col">{sk ? "Trhová hodnota USD" : "Market cap USD"}</th>
        <th scope="col">{sk ? "Denný objem USD" : "Daily volume USD"}</th><th scope="col">ATR %</th>
        <th scope="col">5d %</th><th scope="col">{sk ? "Pomer objemu" : "Volume ratio"}</th>
        <th scope="col">{sk ? "Čakajúci profil" : "Pending profile"}</th><th scope="col">{sk ? "Úroveň" : "Tier"}</th><th scope="col">{sk ? "Dôvody" : "Reasons"}</th><th scope="col">{sk ? "Pravidlá" : "Rules"}</th>
        <th scope="col">{sk ? "Výnimka" : "Override"}</th>
      </tr></thead><tbody>{rows.map((r) => <tr key={r.ticker}>
        <th scope="row">{r.ticker}</th><td>{r.as_of}</td><td>{r.profile}</td>
        <td>{[r.input_values.yoyLatest,r.input_values.yoyPrior1,r.input_values.yoyPrior2,r.input_values.yoyOldest].map(value).join(" / ")}</td><td>{value(r.input_values.marketCapUsd)}</td>
        <td>{value(r.input_values.dollarVolume)}</td><td>{value(r.input_values.atrPercent)}</td>
        <td>{value(r.input_values.move5)}</td><td>{value(r.input_values.volumeRatio)}</td>
        <td>{r.candidate_profile ? `${r.candidate_profile} (${r.candidate_sessions}/10)` : "—"}</td>
        <td>{value(r.input_values.tier)}</td><td>{r.reasons.join(", ") || "—"}</td><td>{r.horizon_rules_version}</td><td>{r.override_reason ? `${r.override_date}: ${r.override_reason}` : "—"}</td>
      </tr>)}</tbody></table></div>
      {rows.length === 0 && <p>{sk ? "Zatiaľ bez uložených profilov." : "No stored profiles yet."}</p>}
    </section>
  </article>;
}
