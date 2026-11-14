import Link from "next/link";
import type { EtfScoreResult, EtfGroup } from "@/engine/etf-score";
import { formatDate, formatNumber, type Locale } from "@/i18n";
import { getEtfFundMessages } from "@/i18n/etf-fund-messages";
import { RecordCard } from "@/components/record-parts";
import s from "./fund.module.css";

const groups: EtfGroup[] = ["cost", "size", "liquidity", "structure", "diversification", "trend", "risk", "income"];
export function EtfRuleBreakdown({ locale, score }: { locale: Locale; score: EtfScoreResult | null | undefined }) {
  const m = getEtfFundMessages(locale);
  const value = (id: string, raw: number | string | boolean | null | undefined): string => {
    if (raw === null || raw === undefined) return m.none;
    if (typeof raw === "boolean") return raw ? locale === "sk" ? "Áno" : "Yes" : locale === "sk" ? "Nie" : "No";
    if (typeof raw === "string") return raw;
    if (id === "aum" || id === "liquidity") return `${formatNumber(locale, raw, 0)} EUR`;
    if (["return12to1m", "benchmark6m", "drawdown3y"].includes(id)) return `${formatNumber(locale, raw * 100, 2)} %`;
    if (["ter", "peerTer", "dailyRange", "topTen", "largestSector", "largestRegion", "volatility1y", "yield"].includes(id)) return `${formatNumber(locale, raw, 2)} %`;
    return formatNumber(locale, raw, 2);
  };
  const gap = (reason: string | undefined, id: string): string => {
    if (!reason) return "—";
    if (reason.startsWith("missing_")) return `${m.gapLabels.missing}: ${m.rules[id as keyof typeof m.rules] ?? reason.slice(8)}`;
    return m.gapLabels[reason as keyof typeof m.gapLabels] ?? reason.replaceAll("_", " ");
  };
  if (!score?.rules.length) return null;
  return <RecordCard id="fund-rules" title={m.breakdown} meta={<Link href={`/${locale}/methodology`}>{m.methodology}</Link>}>
    <div className={s.tableScroll}><table className={s.ruleTable}>
      <thead><tr><th scope="col">{m.rule}</th><th scope="col" className="num">{m.points}</th><th scope="col">{m.threshold}</th><th scope="col">{m.value}</th><th scope="col">{m.date}</th><th scope="col">{m.gap}</th></tr></thead>
      {groups.map((group) => { const rows = score.rules.filter((r) => r.group === group); return rows.length ? <tbody key={group}>
        <tr className={s.groupRow}><th colSpan={6} scope="rowgroup">{m.groups[group]}</th></tr>
        {rows.map((r) => <tr key={r.id}><th scope="row">{m.rules[r.id as keyof typeof m.rules] ?? r.id}</th>
          <td className="num">{r.evidenced ? `${formatNumber(locale, r.earned, 0)} / ${formatNumber(locale, r.max, 0)}` : `— / ${formatNumber(locale, r.max, 0)}`}</td>
          <td>{m.thresholds[r.id as keyof typeof m.thresholds] ?? r.threshold ?? m.none}</td><td>{value(r.id, r.value)}</td>
          <td>{r.date ? formatDate(locale, r.date) : m.none}</td><td>{gap(r.gapReason, r.id)}</td></tr>)}
      </tbody> : null; })}
    </table></div>
  </RecordCard>;
}
