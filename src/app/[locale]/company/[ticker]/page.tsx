import { withPageLog } from "@/app/page-log";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chart } from "@/components/chart";
import { ResultMark, RuleRadar, RuleRow, RuleTable, SectionHead, StateChip, kitState } from "@/components/kit";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { getCompanyMessages } from "@/i18n/company-messages";
import { PaidPart } from "./paid-part";
import { TabBar } from "./tab-bar";
import "./company.css";
import { IdeaCard } from "@/components/idea-card";
import { PaywallSegment } from "@/components/paywall-segment";
import { ScoreHistory } from "@/components/score-history";
import { companyScoreHistory } from "@/data/score-history";
import { flags } from "@/config/flags";
import { getViewer, limitFor } from "@/viewer/get-viewer";
import { FlagsBlock } from "@/components/flags-block";
import { companyFlags } from "@/engine/flags";
import { storedShareCounts, storedInterestFacts } from "@/data/flag-facts";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";
import { coreRulesMet, StatusPanel } from "@/components/status-slider";
import { statusView } from "@/engine/status";
import { SourceList, SourceNotes } from "@/components/source-list";
import { inputSources, ruleSourceNotes, ruleSources, sourceSummary } from "@/components/view-model";
import { companyIdea, companyReview } from "@/data/ideas-store";
import { instrumentUniverse, latestPortfolio, latestScores } from "@/data/store";
import { DataStatus, DataStatusBlock } from "@/components/data-status";
import { datasetFreshness } from "@/data/data-freshness-store";
import { coverageOf } from "@/data/data-freshness";
import { publicHorizons } from "@/data/public-horizons";
import { ProfileBlock } from "@/components/public-profile";
import { CatalystCalendar } from "@/components/catalyst-calendar";
import { storedMacroEvents } from "@/data/macro-calendar-store";
import { publicEarningsDate } from "@/data/catalyst-calendar-store";
export const dynamic = "force-dynamic";
import { fill, formatDate, formatPercent, formatPrice, getMessages, isLocale, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { TickerSeoSummary } from "@/components/ticker-seo-summary";
import { tickerSeoText } from "@/seo/ticker-text";
import { ruleGroups } from "@/i18n/rules";
import { BONUS_RULE_IDS, displayScore } from "@/engine/display-score";
import { reasonsFor, rejectionChecks, ruleDetail, ruleThreshold, sectorLabel, stateKey } from "@/i18n/score-text";

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
  const { locale, instrument, data, result } = await load(params);
  const m = getMessages(locale);
  const seo = tickerSeoText(locale, instrument.ticker, instrument.name, result);
  return pageMetadata(locale, `/company/${instrument.ticker}`, seo?.title ?? (instrument.name === instrument.ticker ? instrument.ticker : fill(m.meta.companyTitle, { ticker: instrument.ticker, name: instrument.name })), seo?.description ?? fill(data.sample ? m.meta.companyDescription : m.meta.companyDescriptionLive, { ticker: instrument.ticker }), `/${locale}/company/${instrument.ticker}/opengraph-image`);
}

async function Company({ params }: Params) {
  const { locale, instrument, instruments, result, data } = await load(params);
  const m = getMessages(locale);
  const adviceOutput = flags().ADVICE_OUTPUT;
  const portfolio = await latestPortfolio();
  const held = portfolio?.weights.some((position) => position.weightPercent > 0 && position.symbol.toUpperCase() === instrument.ticker) ?? false;
  const freshness = await datasetFreshness(instrument.ticker);
  if (!result) return <div className="frame page company is-empty"><header className="company-head co-hero"><div className="company-id"><h1 className="title"><span className="title-ticker">{instrument.ticker}</span>{instrument.name !== instrument.ticker && <span className="title-name">{instrument.name}</span>}</h1><p className="company-meta"><span className="company-sector">{sectorLabel(locale, instrument.sector)}</span>{held && <span className="tag">{m.portfolio.heldNoSignal}</span>}</p></div></header><DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} detail={freshness ? { datasets: freshness, coverage: null } : null} /></div>;
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
  const view = statusView({
    state,
    points: scored ? result.total : null,
    ruleHits: result.ruleHits,
    signals: { insiderNetBuy: f.insiderOrInstitutionalAccumulation, epsBeat: f.epsBeat, guidanceRaised: f.guidanceRaised, productCatalyst: f.productCatalyst },
    adviceOutput,
  });
  const coverage = displayScore(state, result.ruleHits);
  const unknownIds = new Set<string>(view.coverage.unknownRules);
  const sources = scored ? sourceSummary(locale, result) : null;
  const ideaRow = await companyIdea(instrument.ticker);
  const review = await companyReview(instrument.ticker);
  const viewer = await getViewer();
  const history = await companyScoreHistory(instrument.ticker, limitFor(viewer, "scoreHistoryDays"));
  // Flags read stored facts only and never feed the score. Short interest is not collected yet, so it shows no data.
  const interest = await storedInterestFacts(instrument.ticker);
  const flagResults = companyFlags({ bars: result.inputs.bars, shares: await storedShareCounts(instrument.ticker), operatingIncome: interest.operatingIncome, interestExpense: interest.interestExpense, shortInterestPercent: null });
  const horizons = await publicHorizons();
  const today = new Date().toISOString().slice(0, 10);
  const [macroSchedule, earningsDate] = await Promise.all([storedMacroEvents(today), publicEarningsDate(instrument.ticker, today)]);
  const index = instruments.findIndex((item) => item.ticker === instrument.ticker);
  const prev = instruments[(index - 1 + instruments.length) % instruments.length];
  const next = instruments[(index + 1) % instruments.length];

  const c = getCompanyMessages(locale);
  const pullback = state === "watch" && result.pullbackInUptrend;
  const chip = <StateChip state={kitState(state, pullback)} label={pullback ? `${m.status.labels.watch}, ${m.states.pullback}` : m.status.labels[state]} />;
  let rowIndex = 0;

  const lastBar = result.inputs.bars.at(-1);
  const dialLabel = pullback ? `${m.status.labels.watch}, ${m.states.pullback}` : m.status.labels[state];
  const sourceLabel = instrument.source === "sample extension" ? (data.sample ? m.common.extension : m.common.universe) : instrument.source === "discovery" ? m.common.discovery : m.common.guide;
  const facts: { label: string; value: ReactNode }[] = [
    { label: m.company.sector, value: sectorLabel(locale, instrument.sector) },
    { label: m.company.source, value: sourceLabel },
    { label: m.company.session, value: <span className="num">{result.asOf ? formatDate(locale, result.asOf) : m.common.noScore}</span> },
    ...(review ? [
      { label: m.company.lastReviewed, value: <span className="num">{formatDate(locale, review.lastReviewed)}</span> },
      { label: m.company.nextReview, value: <span className="num">{formatDate(locale, review.nextDue)}</span> },
    ] : []),
  ];
  const tabs = [
    { id: "overview", label: c.tabs.overview },
    { id: "rules", label: c.tabs.rules },
    { id: "flags", label: c.tabs.flags },
    { id: "inputs", label: c.tabs.evidence },
    { id: "history", label: c.tabs.history },
  ];
  const ideaHead = <SectionHead id="idea" title={adviceOutput ? m.company.ideaTitle : m.ideas.evidence} lede={adviceOutput ? m.company.ideaNote : undefined} />;
  const historyHead = <SectionHead id="history" title={m.company.history.title} lede={m.company.history.note} />;

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

      <header className="company-head co-hero">
        <div className="company-id">
          <h1 className="title">
            <span className="title-ticker">{instrument.ticker}</span>
            {instrument.name !== instrument.ticker && <span className="title-name">{instrument.name}</span>}
          </h1>
          <p className="company-meta">
            <span className="company-sector">{sectorLabel(locale, instrument.sector)}</span>
            {chip}
            {held && <span className="tag">{state === "setup" || state === "watch" ? m.portfolio.held : m.portfolio.heldNoSignal}</span>}
          </p>
          {lastBar ? (
            <p className="co-price">
              <span className="co-price-value num">{formatPrice(locale, lastBar.close)}</span>
              <span className="co-price-label">{m.chart.close}, {formatDate(locale, lastBar.date)}</span>
            </p>
          ) : null}
          <TickerSeoSummary locale={locale} ticker={instrument.ticker} name={instrument.name} result={result} />
        </div>
        <div className="co-hero-radar">
          <RuleRadar
            ruleHits={result.ruleHits}
            percent={view.display.state === "broken" || !scored ? null : view.display.percent ?? null}
            state={kitState(state, pullback)}
            stateLabel={dialLabel}
            locale={locale}
            labels={m.status.ruleShort}
            motion="load"
            describedBy="score-disclaimer"
            caption={view.display.state === "broken" ? m.status.pointsNotCountedPlain : undefined}
          />
        </div>
        <div className="co-hero-foot">
          <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
        </div>
      </header>

      <TabBar label={c.tabsLabel} tabs={tabs} />

      <div className="co-layout" id="overview">
        <StatusPanel
          className="co-card co-summary"
          variant="rail"
          locale={locale}
          view={view}
          m={m}
          adviceOutput={adviceOutput}
          asOf={result.asOf ? formatDate(locale, result.asOf) : null}
          methodHref={`/${locale}/methodology#states`}
          reasons={reasons}
          pullbackLabel={pullback ? m.states.pullback : null}
          describedBy="score-disclaimer"
          coreMet={coreRulesMet(result.ruleHits)}
          ruleHits={result.ruleHits}
          disclaimer={<OperatorDisclosure text={m.common.operatorDisclosure} />}
        />

        <div className="co-main">
          <section className="co-card co-chart" aria-labelledby="chart" data-o="2">
            <SectionHead id="chart" title={data.sample ? m.company.chartTitle : m.company.chartTitleLive} lede={data.sample ? m.company.chartNote : undefined} meta={data.sample ? <SampleStamp text={m.common.sample} /> : undefined} rule="quiet" />
            <Chart
              bars={result.inputs.bars}
              locale={locale}
              zoneTag={c.zoneTag}
              labels={{ name: instrument.ticker, aria: m.chart.label, close: m.chart.close, ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
            />
          </section>

          <section className="co-card co-rules" aria-labelledby="rules" data-o="3">
            <SectionHead
              id="rules"
              title={m.company.rulesTitle}
              lede={scored ? c.rulesLede : m.company.insufficientNote}
              meta={scored ? <span className="num">{fill(m.company.rulesSummary, { matched: matchedCount, count: result.ruleHits.length })}</span> : undefined}
              rule="quiet"
            />
            {scored ? (
              <RuleTable locale={locale} label={fill(c.rulesTable, { ticker: instrument.ticker })} describedBy="score-disclaimer">
                {ruleGroups.map((group) => [
                  <tr key={group.group} className="kit-rule-group">
                    <th colSpan={5} scope="colgroup">{m.groups[group.group]}</th>
                  </tr>,
                  ...group.rules.map((rule) => {
                    const hit = hits.get(rule.id);
                    const unknown = unknownIds.has(rule.id);
                    const met = !unknown && Boolean(hit?.matched);
                    const bonus = BONUS_RULE_IDS.includes(rule.id);
                    const { notes, replacesSources } = ruleSourceNotes(locale, result, rule.id, unknown);
                    return (
                      <RuleRow
                        key={rule.id}
                        id={rule.id}
                        index={rowIndex++}
                        locale={locale}
                        name={m.rules[rule.id]}
                        needs={needsText(locale, rule.id)}
                        value={unknown || !hit ? null : ruleDetail(locale, hit, result)}
                        result={met ? "pass" : unknown ? "none" : "fail"}
                        max={rule.points}
                        detail={
                          <>
                            <span className="co-rule-kind" data-kind={bonus ? "bonus" : "core"}>{bonus ? m.status.bonusLabel : m.status.coreLabel}</span>
                            {unknown ? <span className="co-rule-nodata">{m.status.noData}</span> : null}
                            {hit ? <span className="rule-src">{replacesSources ? null : <SourceList locale={locale} items={ruleSources(locale, result, rule.id)} />}{replacesSources || !notes.length ? null : " "}<SourceNotes notes={notes} /></span> : null}
                          </>
                        }
                      />
                    );
                  }),
                ])}
              </RuleTable>
            ) : null}
            <p className="co-more">
              <Link className="arrow-link" href={`/${locale}/methodology`}>
                {m.company.methodLink}
                <IconArrowRight />
              </Link>
            </p>
          </section>

          <section className="co-card co-rejection" aria-labelledby="rejection" data-broken={state === "broken" ? "" : undefined} data-o="4">
            <SectionHead id="rejection" title={m.company.rejectionTitle} lede={scored ? c.rejectionLede : undefined} rule="quiet" />
            {scored ? (
              <table className="kit-rules co-checks" data-rejection-checks="" aria-label={fill(c.rejectionTable, { ticker: instrument.ticker })}>
                <thead>
                  <tr>
                    <th scope="col">{c.checkColumns.check}</th>
                    <th scope="col" className="kit-rule-needs">{c.checkColumns.triggers}</th>
                    <th scope="col">{c.checkColumns.value}</th>
                    <th scope="col">{c.checkColumns.result}</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectionChecks(locale, result).map((check) => {
                    const word = check.state === "clear" ? m.company.checks.clear : check.state === "triggered" ? m.company.checks.triggered : capitalize(m.status.noData);
                    const when = stripTemplate(m.company.checks.triggersWhen, check.threshold);
                    return (
                      <tr key={check.id} className="kit-rule" data-check={check.state}>
                        <th scope="row" className="kit-rule-name">
                          <span className="kit-rule-title">{check.label}</span>
                          <span className="kit-rule-needs-inline" aria-hidden="true">{c.checkColumns.triggers}: {when}</span>
                        </th>
                        <td className="kit-rule-needs">{when}</td>
                        <td className="kit-rule-value num">{check.value}</td>
                        <td className="kit-rule-result">
                          <span className="kit-mark" data-check={check.state}>
                            <ResultMark result={check.state === "clear" ? "pass" : check.state === "triggered" ? "fail" : "none"} />
                          </span>
                          <span className="co-check-word">{word}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : reasons.length ? (
              <ul className="reason-list">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{m.company.rejectionNone}</p>
            )}
          </section>

          <section className="co-card co-inputs" aria-labelledby="inputs" data-o="6">
            <SectionHead id="inputs" title={m.company.inputsTitle} rule="quiet" />
            <dl className="input-list">
              {inputs.map(([label, value, field, key]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="num">{value}{field && result.agreement?.[field] ? <small className="muted"> · {m.agreement[result.agreement[field] as keyof typeof m.agreement]}</small> : null}{field && result.expiredFields?.includes(field) ? <small className="muted"> · {m.agreement.expired}</small> : field && result.carriedFrom?.[field] ? <small className="muted"> · {fill(m.agreement.carried, { date: formatDate(locale, result.carriedFrom[field]) })}</small> : null}</dd>
                  <dd className="input-src"><SourceList locale={locale} items={inputSources(locale, result, key)} emptyNote={key === "productCatalyst"} /></dd>
                </div>
              ))}
            </dl>
          </section>

          {ideaRow ? (
            <section className="co-card co-card-paid co-idea" aria-labelledby="idea" data-o="7">
              <PaidPart id="idea-card" head={ideaHead} viewer={viewer} locale={locale} status={chip}>
                {(v) => <PaywallSegment id="idea-card" viewer={v} locale={locale}><IdeaCard idea={ideaRow.idea} locale={locale} showAmounts={false} stateLabel={m.states[state]} nested /></PaywallSegment>}
              </PaidPart>
            </section>
          ) : (
            <section className="co-card co-idea" aria-labelledby="idea" data-o="7">
              <SectionHead id="idea" title={m.company.ideaTitle} rule="quiet" />
              <p className="muted">{m.company.noIdea}</p>
            </section>
          )}

          <section className="co-card co-card-paid co-history" aria-labelledby="history" data-o="8">
            <PaidPart id="score-history" head={historyHead} viewer={viewer} locale={locale}>
              {(v) => <PaywallSegment id="score-history" viewer={v} locale={locale}><div><ScoreHistory ticker={instrument.ticker} rows={history} locale={locale} /></div></PaywallSegment>}
            </PaidPart>
          </section>
        </div>

        <div className="co-rail" role="group" aria-label={c.railLabel}>
          <section className="co-card co-keyfacts" aria-labelledby="facts" data-o="9">
            <SectionHead id="facts" title={c.factsTitle} rule="quiet" as="h2" />
            <dl className="co-facts-list">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <CatalystCalendar locale={locale} today={today} macro={macroSchedule} earnings={earningsDate} />

          {sources ? (
            <section className="co-card co-sources" aria-labelledby="sources" data-o="10">
              <SectionHead id="sources" title={c.sourcesTitle} rule="quiet" />
              <p className="source-summary">{sources}</p>
            </section>
          ) : null}
          {freshness && <DataStatusBlock locale={locale} detail={{ datasets: freshness, coverage: coverageOf(coverage.coreKnown, coverage.coreTotal, coverage.evidencedMax) }} />}

          <FlagsBlock flags={flagResults} locale={locale} m={m} />
          <ProfileBlock locale={locale} horizon={horizons[instrument.ticker]} />
        </div>
      </div>
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The text a "{text}" template wraps: "Needs: growth of 20%" becomes "Growth of 20%". */
function stripTemplate(template: string, filled: string): string {
  const [before, after = ""] = template.split("{text}");
  let text = filled;
  if (before && text.startsWith(before)) text = text.slice(before.length);
  if (after && text.endsWith(after)) text = text.slice(0, -after.length);
  return capitalize(text.trim());
}

/** The rule threshold for the Needs column, without the "Needs:" prefix that the column header already says. */
function needsText(locale: Locale, id: string): string {
  const filled = ruleThreshold(locale, id);
  return filled ? stripTemplate(getMessages(locale).company.needs, filled) : "";
}

export default withPageLog("/company/[ticker]", Company);
