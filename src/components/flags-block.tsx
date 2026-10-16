import { fill, formatCompact, formatDate, formatNumber, formatPercent, type Locale, type Messages } from "@/i18n";
import { FLAG_THRESHOLDS, type FlagId, type FlagResult } from "@/engine/flags";
import { IconCheck, IconCross, IconNoData } from "./icons";
import { SectionHead } from "./kit";

const pct = (locale: Locale, value: number) => formatPercent(locale, value / 100, 0);
const usd = (locale: Locale, value: number) => `${formatCompact(locale, value)} USD`;

function threshold(locale: Locale, m: Messages, id: FlagId): string {
  const text = m.flags.thresholds[id];
  return fill(text, { percent: pct(locale, id === "dilution" ? FLAG_THRESHOLDS.dilutionPercent : id === "shortInterest" ? FLAG_THRESHOLDS.shortInterestPercent : FLAG_THRESHOLDS.drawdownPercent), days: FLAG_THRESHOLDS.illiquidDays, amount: usd(locale, FLAG_THRESHOLDS.illiquidUsd), times: formatNumber(locale, FLAG_THRESHOLDS.interestCover, 1) });
}

function detail(locale: Locale, m: Messages, flag: FlagResult): string {
  if (flag.state === "no-data") return m.flags.missing[flag.id];
  const v = flag.values;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${formatNumber(locale, n, 1)}%`;
  switch (flag.id) {
    case "dilution": return fill(m.flags.values.dilution, { change: signed(Number(v.change)), from: formatCompact(locale, Number(v.from)), to: formatCompact(locale, Number(v.to)), fromDate: formatDate(locale, String(v.fromDate)), toDate: formatDate(locale, String(v.toDate)) });
    case "illiquid": return fill(m.flags.values.illiquid, { amount: usd(locale, Number(v.average)) });
    case "interestCover": return v.times === undefined ? m.flags.values.interestCoverNone : fill(m.flags.values.interestCover, { times: formatNumber(locale, Number(v.times), 1) });
    case "shortInterest": return fill(m.flags.values.shortInterest, { percent: formatNumber(locale, Number(v.percent), 1) + "%" });
    case "drawdown": return fill(m.flags.values.drawdown, { percent: formatNumber(locale, Number(v.percent), 1) + "%" });
  }
}

/** Flags block for the company page. Separate from the score; the state words are facts, not instructions. */
export function FlagsBlock({ flags, locale, m }: { flags: FlagResult[]; locale: Locale; m: Messages }) {
  return (
    <section className="sheet-section check-block" aria-labelledby="flags" data-flags="">
      <SectionHead id="flags" title={m.flags.title} lede={m.flags.note} rule="quiet" />
      <ul className="check-list" data-flag-list="">
        {flags.map((flag) => {
          const word = flag.state === "flagged" ? m.flags.state.flagged : flag.state === "clear" ? m.flags.state.clear : m.flags.state.noData;
          return (
            <li key={flag.id} className="check-row" data-flag={flag.id} data-state={flag.state}>
              <span className="check-mark" data-mark={flag.state === "flagged" ? "flag" : flag.state === "clear" ? "clear" : "none"}>
                {flag.state === "flagged" ? <IconCross title={word} /> : flag.state === "clear" ? <IconCheck title={word} /> : <IconNoData title={word} />}
              </span>
              <span className="check-name">{m.flags.names[flag.id]}: {word}</span>
              <span className="check-value num">{detail(locale, m, flag)}</span>
              <span className="check-rule">{threshold(locale, m, flag.id)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
