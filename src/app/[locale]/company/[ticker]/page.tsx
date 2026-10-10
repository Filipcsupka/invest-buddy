import { withPageLog } from "@/app/page-log";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chart } from "@/components/chart";
import { groupLabels, TitleBlock } from "@/components/datasheet";
import { IdeaCard } from "@/components/idea-card";
import { PaywallSegment } from "@/components/paywall-segment";
import { flags } from "@/config/flags";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowLeft, IconArrowRight, IconCheck, IconCross } from "@/components/icons";
import { OperatorDisclosure } from "@/components/operator-disclosure";
import { StateChip } from "@/components/score-badge";
import { ScoreMark } from "@/components/score-mark";
import { SourceList } from "@/components/source-list";
import { inputSources, ruleSources, sourceSummary } from "@/components/view-model";
import { companyIdea, companyReview } from "@/data/ideas-store";
import { instrumentUniverse, latestPortfolio, latestScores } from "@/data/store";
import { DataStatus } from "@/components/data-status";
export const dynamic = "force-dynamic";
import { fill, formatDate, formatPercent, getMessages, isLocale, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { ruleGroups } from "@/i18n/rules";
import { reasonsFor, ruleDetail, sectorLabel, stateKey } from "@/i18n/score-text";

type Params = { params: Promise<{ locale: string; ticker: string }> };

// Rendered per request (force-dynamic): the ticker universe is read from the database at run time, so nothing
// is prebuilt and unknown tickers are resolved by load() below. No generateStaticParams: it would need the
// database at build time.
export const dynamicParams = true;

async function load(params: Params["params"]) {
  const { locale, ticker } = await params;
  if (!isLocale(locale)) notFound();
  const instruments = await instrumentUniverse();
  const instrument = instruments.find((item) => item.ticker === ticker.toUpperCase());
  if (!instrument) notFound();
  const data = await latestScores();
  const row = data.rows.find((item) => item.instrument.ticker === instrument.ticker);
  return { locale: locale as Locale, instrument, instruments, result: row?.result ?? null, data };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, instrument, data } = await load(params);
  const m = getMessages(locale);
  return pageMetadata(locale, `/company/${instrument.ticker}`, instrument.name === instrument.ticker ? instrument.ticker : fill(m.meta.companyTitle, { ticker: instrument.ticker, name: instrument.name }), fill(data.sample ? m.meta.companyDescription : m.meta.companyDescriptionLive, { ticker: instrument.ticker }));
}

async function Company({ params }: Params) {
  const { locale, instrument, instruments, result, data } = await load(params);
  const m = getMessages(locale);
  const adviceOutput = flags().ADVICE_OUTPUT;
  const portfolio = await latestPortfolio();
  const held = portfolio?.weights.some((position) => position.weightPercent > 0 && position.symbol.toUpperCase() === instrument.ticker) ?? false;
  if (!result) return <div className="frame page"><h1 className="title">{instrument.ticker}</h1>{held && <span className="tag">{m.portfolio.heldNoSignal}</span>}<DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} /></div>;
  const state = stateKey(result.state);
  const scored = state !== "insufficient";
  const hits = new Map(result.ruleHits.map((hit) => [hit.id, hit]));
  const reasons = reasonsFor(locale, result);
  const matchedCount = result.ruleHits.filter((hit) => hit.matched).length;
  const f = result.inputs.fundamentals;
  const mac = result.inputs.macro;
  const yesNo = (value: boolean | null) => value === null ? m.common.unknown : value ? m.common.yes : m.common.no;
  const inputs: [string, string, string | undefined, string][] = [
    [m.company.inputs.revenueAccelerating, f.revenueAccelerating === undefined ? m.common.unknown : yesNo(f.revenueAccelerating), "revenueAccelerating", "revenueAccelerating"],
    [m.company.inputs.revenueGrowthCurrent, f.revenueGrowthCurrent === null ? m.common.unknown : formatPercent(locale, f.revenueGrowthCurrent / 100, 0), undefined, "revenueGrowthCurrent"],
    [m.company.inputs.revenueGrowthPrior, f.revenueGrowthPrior === null ? m.common.unknown : formatPercent(locale, f.revenueGrowthPrior / 100, 0), undefined, "revenueGrowthPrior"],
    [m.company.inputs.revenueDeclining, yesNo(f.revenueDeclining), "revenueDeclining", "revenueDeclining"],
    [m.company.inputs.epsBeat, yesNo(f.epsBeat), "epsBeat", "epsBeat"],
    [m.company.inputs.guidanceRaised, yesNo(f.guidanceRaised), "guidanceRaised", "guidanceRaised"],
    [m.company.inputs.earningsMissAndGuidanceCut, yesNo(f.earningsMissAndGuidanceCut), undefined, "earningsMissAndGuidanceCut"],
    [m.company.inputs.guidanceCut, yesNo(result.consensusValues?.guidanceCut ?? null), "guidanceCut", "guidanceCut"],
    [m.company.inputs.narrativeChanged, yesNo(result.consensusValues?.narrativeChanged ?? null), "narrativeChanged", "narrativeChanged"],
    [m.company.inputs.productCatalyst, yesNo(f.productCatalyst), "productCatalyst", "productCatalyst"],
    [m.company.inputs.insiderOrInstitutionalAccumulation, yesNo(f.insiderOrInstitutionalAccumulation), "insiderOrInstitutionalBuying", "insiderOrInstitutionalAccumulation"],
    [m.company.inputs.noRevenue, yesNo(f.noRevenue), undefined, "noRevenue"],
    [m.company.inputs.memePump, yesNo(f.memePump), undefined, "memePump"],
    [m.company.inputs.growthSectorRotation, yesNo(mac.growthSectorRotation), "sectorRotationIntoGrowth", "growthSectorRotation"],
    [m.company.inputs.dataTailwind, yesNo(mac.dataTailwind), "dataTailwind", "dataTailwind"],
  ];
  const sources = scored ? sourceSummary(locale, result) : null;
  const ideaRow = await companyIdea(instrument.ticker);
  const review = await companyReview(instrument.ticker);
  const index = instruments.findIndex((item) => item.ticker === instrument.ticker);
  const prev = instruments[(index - 1 + instruments.length) % instruments.length];
  const next = instruments[(index + 1) % instruments.length];

  return (
    <div className="frame page company">
      <nav className="crumbs" aria-label={m.nav.dashboard}>
        <Link className="arrow-link is-back" href={`/${locale}/dashboard`}>
          <IconArrowLeft />
          {m.company.back}
        </Link>
        <span className="crumbs-step">
          <Link href={`/${locale}/company/${prev.ticker}`} className="step-link" aria-label={prev.name}>
            <IconArrowLeft />
            {prev.ticker}
          </Link>
          <Link href={`/${locale}/company/${next.ticker}`} className="step-link" aria-label={next.name}>
            {next.ticker}
            <IconArrowRight />
          </Link>
        </span>
      </nav>

      <header className="company-head">
        <h1 className="title">
          <span className="title-ticker">{instrument.ticker}</span>
          {instrument.name !== instrument.ticker && <span className="title-name">{instrument.name}</span>}
        </h1>
        {held && <p><span className="tag">{state === "setup" || state === "watch" ? m.portfolio.held : m.portfolio.heldNoSignal}</span></p>}
        <TitleBlock
          stamp={data.sample ? m.common.sample : undefined}
          fields={[
            { label: m.company.sector, value: sectorLabel(locale, instrument.sector) },
            { label: m.company.source, value: instrument.source === "sample extension" ? (data.sample ? m.common.extension : m.common.universe) : instrument.source === "discovery" ? m.common.discovery : m.common.guide },
            { label: m.company.session, value: <span className="num">{result.asOf ? formatDate(locale, result.asOf) : m.common.noScore}</span> },
            ...(review ? [
              { label: m.company.lastReviewed, value: <span className="num">{formatDate(locale, review.lastReviewed)}</span> },
              { label: m.company.nextReview, value: <span className="num">{formatDate(locale, review.nextDue)}</span> },
            ] : []),
          ]}
        />
      </header>

      <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
      <section className="score-panel" aria-labelledby="score">
        <h2 id="score" className="visually-hidden">
          {m.company.scoreTitle}
        </h2>
        <div className="score-readout">
          <p className="score-total num">
            {scored ? result.total : m.common.noScore}
            {scored ? <span className="score-of">{m.common.outOf25}</span> : null}
          </p>
          <div className="score-state">
            <StateChip state={state} label={m.states[state]} pullbackLabel={state === "watch" && result.pullbackInUptrend ? m.states.pullback : null} describedBy="score-disclaimer" />
            <Disclaimer text={m.common.disclaimer} id="score-disclaimer" />
            <OperatorDisclosure text={m.common.operatorDisclosure} />
          </div>
        </div>
        {sources && <p className="source-summary muted small">{sources}</p>}
        <ScoreMark size="lg" state={state} matched={scored ? result.ruleHits.filter((hit) => hit.matched).map((hit) => hit.id) : null} groupLabels={groupLabels(locale, result)} label={scored ? fill(m.mark.label, { total: result.total, fundamentals: result.fundamentals, technical: result.technical, macro: result.macro }) : m.mark.none} />
      </section>

      {ideaRow && (
        <section className="sheet-section" aria-labelledby="idea">
          <div className="section-head">
            <h2 id="idea">{adviceOutput ? m.company.ideaTitle : m.ideas.evidence}</h2>
            {adviceOutput && <p className="muted small">{m.company.ideaNote}</p>}
          </div>
          <PaywallSegment id="idea-card"><IdeaCard idea={ideaRow.idea} locale={locale} showAmounts={false} stateLabel={m.states[state]} nested /></PaywallSegment>
        </section>
      )}
      {!ideaRow && (
        <section className="sheet-section" aria-labelledby="idea">
          <div className="section-head">
            <h2 id="idea">{m.company.ideaTitle}</h2>
          </div>
          <p className="muted">{m.company.noIdea}</p>
        </section>
      )}

      <section className="sheet-section" aria-labelledby="chart">
        <div className="section-head">
          <h2 id="chart">{data.sample ? m.company.chartTitle : m.company.chartTitleLive}</h2>
          {data.sample && <p className="muted small">{m.company.chartNote}</p>}
        </div>
        <Chart
          animate
          bars={result.inputs.bars}
          locale={locale}
          labels={{ name: instrument.ticker, aria: m.chart.label, close: m.chart.close, ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
        />
      </section>

      <div className="company-grid">
        <section className="sheet-section" aria-labelledby="rules">
          <div className="section-head">
            <h2 id="rules">{m.company.rulesTitle}</h2>
            <p className="muted small">{scored ? fill(m.company.rulesSummary, { matched: matchedCount, count: result.ruleHits.length }) : m.company.insufficientNote}</p>
          </div>
          {scored ? (
            <table className="rule-table">
              <thead>
                <tr>
                  <th scope="col">{m.table.rules}</th>
                  <th scope="col" className="num">
                    {m.common.points}
                  </th>
                </tr>
              </thead>
              {ruleGroups.map((group) => (
                <tbody key={group.group}>
                  <tr className="rulebook-group">
                    <th scope="rowgroup">{m.groups[group.group]}</th>
                    <td className="num">
                      {result[group.group]}/{group.max}
                    </td>
                  </tr>
                  {group.rules.map((rule) => {
                    const hit = hits.get(rule.id);
                    const met = Boolean(hit?.matched);
                    return (
                      <tr key={rule.id} className={met ? "is-met" : undefined}>
                        <th scope="row">
                          <span className="rule-line">
                            {met ? <IconCheck title={m.common.met} /> : <IconCross title={m.common.notMet} />}
                            <span className="rule-name">{m.rules[rule.id]}</span>
                          </span>
                          {hit ? <span className="rule-def num">{ruleDetail(locale, hit, result)}</span> : null}
                          {hit ? <span className="rule-def rule-src"><SourceList locale={locale} items={ruleSources(locale, result, rule.id)} /></span> : null}
                        </th>
                        <td className="num rule-points">{met ? `+${rule.points}` : "0"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          ) : null}
          <p className="small">
            <Link className="arrow-link" href={`/${locale}/methodology`}>
              {m.company.methodLink}
              <IconArrowRight />
            </Link>
          </p>
        </section>

        <aside className="company-side">
          <section className="sheet-section" aria-labelledby="rejection">
            <h2 id="rejection">{m.company.rejectionTitle}</h2>
            {reasons.length ? (
              <ul className="reason-list">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{m.company.rejectionNone}</p>
            )}
          </section>
          <section className="sheet-section" aria-labelledby="inputs">
            <h2 id="inputs">{m.company.inputsTitle}</h2>
            <dl className="input-list">
              {inputs.map(([label, value, field, key]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="num">{value}{field && result.agreement?.[field] ? <small className="muted"> · {m.agreement[result.agreement[field] as keyof typeof m.agreement]}</small> : null}{field && result.expiredFields?.includes(field) ? <small className="muted"> · {m.agreement.expired}</small> : field && result.carriedFrom?.[field] ? <small className="muted"> · {fill(m.agreement.carried, { date: formatDate(locale, result.carriedFrom[field]) })}</small> : null}</dd>
                  <dd className="input-src"><SourceList locale={locale} items={inputSources(locale, result, key)} /></dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default withPageLog("/company/[ticker]", Company);
