import Link from "next/link";
import { getMessages, type Locale } from "@/i18n";
import { formatNumber } from "@/i18n";
import { indexMessages } from "@/i18n/index-messages";
import type { AssetSummary } from "@/db/markets";
import type { ComponentFacts, IndexAnalytics, IndexBar } from "@/markets/index-analytics";
import type { IndexRatingResult } from "@/markets/index-rating";
import { AreaChip } from "@/components/kit";
import { OperatorDisclosure } from "@/components/operator-disclosure";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { day, level, signedRatio } from "./format";
import { IndexPriceChart } from "./index-price-chart";
import s from "./index-pages.module.css";

const percent = (locale: Locale, value: number | null, digits = 1) => value === null ? null : `${formatNumber(locale, value, digits)} %`;
const covered = (locale: Locale, n: number, of: number) => `${n} / ${of} · ${percent(locale, of ? n / of * 100 : 0, 0)}`;
function stockState(locale: Locale, state: string | null | undefined): string {
  if (!state) return "";
  const labels = getMessages(locale).states;
  if (state.startsWith("Setup met")) return labels.setup;
  if (state.startsWith("Watch")) return labels.watch;
  if (state.startsWith("Pullback")) return labels.pullback;
  if (state.startsWith("Wait")) return labels.wait;
  if (state.startsWith("Ignore")) return labels.ignore;
  if (state.startsWith("Criteria broken")) return labels.broken;
  if (state.startsWith("Insufficient data")) return labels.insufficient;
  return state;
}

/** Factors built from our per-stock rule states: their details are stock data (canSeeStockData), the composite is not. */
const STOCK_DATA_FACTORS: ReadonlySet<string> = new Set(["distribution"]);

export function IndexDetail({ locale, summary, analytics, rating, bars, components, componentsTotal, componentsAsOf, stockStatesVisible }: { locale: Locale; summary: AssetSummary; analytics: IndexAnalytics; rating: IndexRatingResult | null; bars: IndexBar[]; components: ComponentFacts[]; componentsTotal: number; componentsAsOf: string | null; stockStatesVisible: boolean }) {
  const m = indexMessages(locale);
  const vix = analytics.isVolatilityIndex;
  const p = analytics.price;
  const status = vix ? (rating?.volatilityRegime?.label ? m.regimes[rating.volatilityRegime.label] : m.notEnough) : rating?.band ? m.bands[rating.band] : m.notEnough;
  const basis = rating?.basisText?.[locale];
  const e = analytics.earnings;
  const breadth = analytics.breadth;
  const seenWeight = components.some((c) => c.weight !== null);
  const showStockState = stockStatesVisible && components.some((c) => c.state);
  const componentCount = componentsTotal > components.length ? m.countShown.replace("{n}", String(components.length)).replace("{total}", String(componentsTotal))
    : components.length === 1 ? m.countOne : m.count.replace("{n}", String(components.length));
  // VIX is a volatility level: moving averages, drawdown and realized volatility are equity measures and stay off.
  const metrics = ([[m.m1, p.returns.m1], [m.m3, p.returns.m3], [m.y1, p.returns.y1], ...(vix ? [] : [[m.ma50, p.ma50], [m.ma200, p.ma200], [m.drawdown, p.drawdownFromHigh], [m.vol20, p.vol20]])] as [string, number | null][])
    .filter(([, value]) => value !== null);
  return <div className="frame page"><RecordHead area={<AreaChip locale={locale} area="indices" />} title={summary.name} lede={vix ? m.volatilityLede : m.detailLede}
    meta={<><span className="rp-pill num">{summary.code}{summary.currency && summary.currency !== "NA" ? ` · ${summary.currency}` : ""}</span><span className="rp-pill num">{m.asOf} {day(locale, rating?.asOf ?? p.asOf)}</span></>}
    actions={<><Link className="button secondary" href={`/${locale}/indices`}>{m.back}</Link><Link className="button secondary" href={`/${locale}/indices#index-rating`}>{m.methodology}</Link></>} />
    <div className={s.stack}><OperatorDisclosure text={getMessages(locale).common.operatorDisclosure} />
      <div className={s.ratingLead}><div><span className={s.ratingLabel}>{vix ? m.volatilityContext : m.rating}</span><div className={s.ratingTitle}>{status}</div>{!vix && rating?.score !== null && rating?.score !== undefined ? <p className={s.score}><strong className="num">{rating.score}</strong> {m.outOf}</p> : null}</div>
        <div className={s.ratingMeta}>{!vix && rating ? <><p><strong>{m.basis}</strong> {basis?.label ?? m.notEnough}</p>{basis ? <p>{basis.description}</p> : null}<p><strong>{m.coverage}</strong> {percent(locale, rating.coveragePct, 0)}</p></> : null}{vix && rating?.volatilityRegime?.percentile !== null && rating?.volatilityRegime?.percentile !== undefined ? <p><strong>{m.percentile}</strong> {percent(locale, rating.volatilityRegime.percentile, 0)}</p> : null}<p><strong>{m.asOf}</strong> {day(locale, rating?.asOf ?? p.asOf)}</p></div></div>
      <KpiRow count={4}><KpiCard label={m.latestClose} featured note={day(locale, p.asOf)}>{level(locale, p.last)}</KpiCard><KpiCard label={m.d1}>{p.returns.d1 === null ? "—" : signedRatio(locale, p.returns.d1)}</KpiCard><KpiCard label={m.d5}>{p.returns.d5 === null ? "—" : signedRatio(locale, p.returns.d5)}</KpiCard><KpiCard label={m.ytd}>{p.returns.ytd === null ? "—" : signedRatio(locale, p.returns.ytd)}</KpiCard></KpiRow>
      <div className={s.metricBand}>{metrics.map(([label,value]) => <div key={label}><span>{label}</span><strong className="num">{label === m.ma50 || label === m.ma200 ? level(locale, value) : label === m.vol20 ? percent(locale, value! * 100) : signedRatio(locale, value)}</strong></div>)}</div>
      <RecordCard id="index-price" title={m.priceHistory} meta={<span className="num">{p.sessions} {m.sessions.toLowerCase()} · {day(locale, p.asOf)}</span>}><IndexPriceChart bars={bars} locale={locale} name={summary.name} equity={!vix} /></RecordCard>
      {vix ? <RecordCard id="volatility-context" title={m.volatilityContext}><dl className={s.facts}>{analytics.volatility ? <><div><dt>{m.latestClose}</dt><dd>{level(locale, analytics.volatility.level)}</dd></div><div><dt>{m.d5}</dt><dd>{signedRatio(locale, analytics.volatility.change5d)}</dd></div><div><dt>{m.m1}</dt><dd>{signedRatio(locale, analytics.volatility.change1m)}</dd></div><div><dt>{m.sessions}</dt><dd>{analytics.volatility.historyN}</dd></div></> : null}</dl>{!rating?.volatilityRegime?.assessed ? <p>{m.noVolatility}</p> : null}</RecordCard> : <>
        <RecordCard id="rating-evidence" title={m.evidence} lede={m.methodologyIntro}><div className={s.factors}>{rating?.factors.map((factor) => !stockStatesVisible && STOCK_DATA_FACTORS.has(factor.id) ? <article className={s.factor} key={factor.id}><div className={s.factorHead}><h3>{m.factors[factor.id]}</h3></div><p className={s.factorNote}>{m.stockDetailsLocked}</p><p>{m.thresholds[factor.id]}</p></article>
          : <article className={s.factor} key={factor.id}><div className={s.factorHead}><h3>{m.factors[factor.id]}</h3><strong className="num">{factor.assessed ? `${formatNumber(locale, factor.points!, 2)} / ${factor.max}` : m.unavailable}</strong></div><dl className={s.factorFacts}><div><dt>{m.measured}</dt><dd>{factor.value === null ? "—" : factor.id === "trend" ? `${factor.value} / 4` : factor.id === "volatility" ? percent(locale, factor.value) : percent(locale, factor.value, 0)}</dd></div><div><dt>{m.evidenceDate}</dt><dd>{day(locale, factor.date)}</dd></div></dl><p>{m.thresholds[factor.id]}</p>{factor.notes.length ? <p className={s.factorNote}>{factor.notes.map((note) => m.noteCodes[note]).join(" · ")}</p> : null}</article>) ?? <p>{m.notEnough}</p>}</div></RecordCard>
        <div className={s.twoCol}><RecordCard id="index-breadth" title={m.breadth}><dl className={s.facts}>{breadth ? <><div><dt>{m.aboveMa50}</dt><dd>{breadth.aboveMa50.value === null ? m.unavailable : percent(locale, breadth.aboveMa50.value, 0)}<small>{covered(locale, breadth.aboveMa50.n, breadth.aboveMa50.of)} · {day(locale, breadth.aboveMa50.asOf)}</small></dd></div><div><dt>{m.aboveMa200}</dt><dd>{breadth.aboveMa200.value === null ? m.unavailable : percent(locale, breadth.aboveMa200.value, 0)}<small>{covered(locale, breadth.aboveMa200.n, breadth.aboveMa200.of)} · {day(locale, breadth.aboveMa200.asOf)}</small></dd></div></> : <div><dd>{m.unavailable}</dd></div>}</dl></RecordCard>
          <RecordCard id="index-earnings" title={m.earnings}><dl className={s.facts}>{e ? ([[m.revenueUp, e.revenueUp], [m.earningsUp, e.earningsUp], [m.accelerating, e.accelerating]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.value === null ? m.unavailable : percent(locale, value.value, 0)}<small>{covered(locale, value.n, value.of)} · {day(locale, value.asOf)}</small></dd></div>) : <div><dd>{m.unavailable}</dd></div>}</dl></RecordCard></div>
        <RecordCard id="index-components" title={m.components} lede={componentsAsOf ? m.componentDate.replace("{date}", day(locale, componentsAsOf)) : undefined} meta={<span className="num">{componentCount}</span>} flush>{components.length ? <div className={s.tableWrap}><table className={s.table}><caption className="visually-hidden">{m.components}</caption><thead><tr><th scope="col">{m.code}</th><th scope="col">{m.name}</th><th scope="col">{m.sector}</th>{seenWeight ? <th scope="col">{m.weight}</th> : null}{showStockState ? <><th scope="col">{m.stockState}</th><th scope="col">{m.stockDate}</th></> : null}</tr></thead><tbody>{components.map((c) => <tr key={`${c.code}.${c.exchange ?? ""}`}><th scope="row">{c.code}<span className={s.sub}>{c.exchange}</span></th><td>{c.name ?? ""}</td><td>{c.sector ?? ""}</td>{seenWeight ? <td className="num">{c.weight === null ? "" : percent(locale, c.weight * 100, 2)}</td> : null}{showStockState ? <><td>{stockState(locale, c.state)}</td><td>{c.stateAsOf ? day(locale, c.stateAsOf) : ""}</td></> : null}</tr>)}</tbody></table></div> : <p className={s.empty}>{m.noComponents}</p>}</RecordCard>
      </>}
      <p className={s.note}>{m.source}</p>
    </div></div>;
}
