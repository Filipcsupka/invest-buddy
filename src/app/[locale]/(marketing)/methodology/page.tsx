import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import Link from "next/link";
import type { CSSProperties } from "react";
import { DataTable, ScoreBar, StateChip } from "@/components/kit";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { ReadingLayout } from "@/components/reading-layout";
import "@/components/record-pages.css";
import { RULESET_DATE, RULESET_VERSION } from "@/config/rules";
import { BONUS_RULE_IDS } from "@/engine/display-score";
import { DIP_DRAWDOWN } from "@/engine/score";
import { ACCUMULATION_UPDOWN_RATIO } from "@/engine/indicators";
import { fill, formatNumber, formatPercent, getMessages, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { pageMetadata } from "@/i18n/metadata";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import { ruleGroups } from "@/i18n/rules";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { profileCopy } from "@/i18n/profile-messages";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/methodology", m.meta.methodologyTitle, m.meta.methodologyDescription);
}

/** Mean green-day volume must reach this multiple of red-day volume (the 1.2 factor in src/engine/indicators.ts). */
const GREEN_VOLUME_RATIO = 1.2;

const bandOrder = ["setup", "watch", "wait", "ignore", "broken", "insufficient"] as const;

function threshold(locale: Locale, id: keyof ReturnType<typeof getMessages>["ruleThresholds"]): string {
  const m = getMessages(locale);
  const green = id === "green-volume";
  return fill(m.ruleThresholds[id], {
    ratio: formatNumber(locale, green ? GREEN_VOLUME_RATIO : ACCUMULATION_UPDOWN_RATIO, green ? 1 : 2),
    min: formatPercent(locale, DIP_DRAWDOWN.min, 0),
    max: formatPercent(locale, DIP_DRAWDOWN.max, 0),
  });
}

async function Methodology({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const rp = getRecordPagesMessages(locale).method;
  const cols = getKitMessages(locale).rule.columns;
  const toc = [
    { id: "score", label: m.methodology.scoreTitle },
    { id: "states", label: m.status.legendTitle },
    { id: "profiles", label: profileCopy[locale].methodTitle },
    { id: "rejection", label: m.methodology.rejectionTitle },
    { id: "worked", label: m.methodology.workedTitle },
    { id: "source-labels", label: m.sources.legendTitle },
    { id: "limits", label: m.methodology.limitsTitle },
    { id: "data", label: m.methodology.dataTitle },
    { id: "etf-rating", label: locale === "sk" ? "Hodnotenie ETF" : "ETF rating" },
  ];
  const sourceLines = [m.sources.legendComputed, m.sources.legendSec, m.sources.legendTwo, m.sources.legendChecked, m.sources.legendSingle, m.sources.legendUnknown];
  const ruleCount = ruleGroups.reduce((sum, group) => sum + group.rules.length, 0);
  const pointsTotal = ruleGroups.reduce((sum, group) => sum + group.max, 0);
  const topPoints = Math.max(...ruleGroups.flatMap((group) => group.rules.map((rule) => rule.points)));
  return (
    <article className="frame page rp-article">
      <RecordHead
        title={m.methodology.title}
        lede={m.methodology.lede}
        meta={<><span className="rp-pill">{m.methodology.versionLine.replace("{version}", RULESET_VERSION).replace("{date}", RULESET_DATE)}</span><Disclaimer text={m.common.disclaimer} /></>}
        actions={<Link className="button secondary" href={`/${locale}/track-record`}>{rp.record}</Link>}
      />

      <KpiRow count={4}>
        <KpiCard featured label={rp.rulesLabel}>{formatNumber(locale, ruleCount)}</KpiCard>
        <KpiCard label={rp.pointsLabel}>{formatNumber(locale, pointsTotal)}</KpiCard>
        <KpiCard label={rp.stepsLabel}>{formatNumber(locale, bandOrder.length)}</KpiCard>
        <KpiCard label={rp.versionLabel}>{RULESET_DATE}</KpiCard>
      </KpiRow>

      <ReadingLayout locale={locale} toc={toc}>
        <RecordCard id="profiles" title={profileCopy[locale].methodTitle}><p>{profileCopy[locale].methodBody}</p></RecordCard>
        <RecordCard id="score" title={m.methodology.scoreTitle} lede={m.methodology.scoreBody} flush>
          <DataTable label={m.methodology.scoreTitle} bounded={false}>
            <thead>
              <tr>
                <th scope="col">{cols.rule}</th>
                <th scope="col">{rp.threshold}</th>
                <th scope="col" className="num">{rp.weight}</th>
              </tr>
            </thead>
            {ruleGroups.map((group) => (
              <tbody key={group.group}>
                <tr className="rp-group">
                  <th scope="rowgroup" colSpan={3}>
                    {m.groups[group.group]}
                    <span>{fill(m.methodology.groupMax, { max: group.max })}</span>
                  </th>
                </tr>
                {group.rules.map((rule) => (
                  <tr key={rule.id}>
                    <th scope="row" className="rp-rule">
                      <span className="rp-rule-name">{m.rules[rule.id]} <small>{BONUS_RULE_IDS.includes(rule.id) ? m.status.bonusLabel : m.status.coreLabel}</small></span>
                      <span className="rp-rule-def">{m.ruleDefinitions[rule.id]}</span>
                    </th>
                    <td className="rp-needs">{threshold(locale, rule.id)}</td>
                    <td className="num rp-weight">
                      <span className="rp-wcell">
                        <span className="rp-wbar" aria-hidden="true"><span style={{ width: `${Math.round((rule.points / topPoints) * 100)}%` }} /></span>
                        +{rule.points}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </DataTable>
        </RecordCard>

        <RecordCard id="states" title={m.status.legendTitle} lede={m.status.legendLede}>
          <p className="rp-axis" aria-hidden="true">{rp.higher}</p>
          <ol className="rp-ladder">
            {bandOrder.map((state, index) => (
              <li key={state} data-state={state} style={{ "--i": index } as CSSProperties}>
                <StateChip state={state} label={m.status.labels[state]} />
                <span className="rp-ladder-range">{m.status.ranges[state]}</span>
                <p className="rp-ladder-meaning">
                  {m.status.meaning[state]}
                  {state === "broken" ? <> <a href="#rejection">{m.methodology.rejectionTitle}</a></> : null}
                </p>
              </li>
            ))}
          </ol>
          <p className="rp-axis" aria-hidden="true">{rp.lower}</p>
          <div className="rp-two">
            <div>
              <h3>{m.status.legendMissingTitle}</h3>
              <p>{m.status.legendMissing}</p>
            </div>
            <div>
              <h3>{m.status.legendConfirmTitle}</h3>
              <p>{m.status.legendConfirm}</p>
            </div>
          </div>
        </RecordCard>

        <RecordCard id="rejection" title={m.methodology.rejectionTitle}>
          <p className="prose">{m.methodology.rejectionBody}</p>
          <p className="prose">{m.methodology.historyBody}</p>
        </RecordCard>

        <RecordCard id="worked" title={m.methodology.workedTitle} lede={m.methodology.workedBody}>
          <div className="rp-worked">
            <figure aria-label={fill(rp.exampleAria, { n: 1 })}>
              <figcaption>{rp.exampleOne}</figcaption>
              <ScoreBar percent={74} state="setup" stateLabel={m.status.labels.setup} locale={locale} motion="view" describedBy="worked-disclaimer" />
            </figure>
            <figure aria-label={fill(rp.exampleAria, { n: 2 })}>
              <figcaption>{rp.exampleTwo}</figcaption>
              <ScoreBar percent={82} state="watch" stateLabel={m.status.labels.watch} locale={locale} motion="view" describedBy="worked-disclaimer" />
            </figure>
          </div>
          <p className="prose">{m.methodology.workedCap}</p>
          <Disclaimer text={m.common.disclaimer} id="worked-disclaimer" compact />
        </RecordCard>

        <RecordCard id="source-labels" title={m.sources.legendTitle}>
          <ul className="rp-list">
            {sourceLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </RecordCard>

        <RecordCard id="limits" title={m.methodology.limitsTitle} className="rp-limits">
          <p className="prose">{m.methodology.limitsBody}</p>
        </RecordCard>

        <RecordCard id="data" title={m.methodology.dataTitle}>
          <p className="prose">{process.env.DATA_MODE === "fixture" ? m.methodology.dataBody : m.methodology.dataBodyLive}</p>
        </RecordCard>

        <RecordCard id="etf-rating" title={locale === "sk" ? "Hodnotenie ETF" : "ETF rating"}>
          <p className="prose">{locale === "sk" ? `Verzia ${ETF_RULES_VERSION}. Informačný prehľad delí získané body bodmi s doloženými údajmi. Na zobrazenie percenta treba TER a údaj z ďalšej skupiny nad rámec samotného obalu alebo domicilu. Zobrazuje sa počet skupín s údajmi zo štyroch a zoznam chýbajúcich údajov.` : `Version ${ETF_RULES_VERSION}. This informational screen divides earned points by points with data. A percentage needs TER and evidence in another group beyond wrapper or domicile alone. Each result shows the number of groups with data out of four and its missing facts.`}</p>
          <ul className="rp-list">
            {(locale === "sk" ? [
              "Náklady (10): TER do 0,10 % / 0,20 % / 0,30 % / 0,50 % / 0,75 % získa 10 / 8 / 6 / 4 / 2 bodov; vyšší TER 0. Nulový a chýbajúci TER je chýbajúci údaj.",
              "Veľkosť a objem obchodovania (10): AUM v EUR od 50 mil. / 100 mil. / 500 mil. / 1 mld. získa 1 / 3 / 5 / 6 bodov. Medián dennej hodnoty obchodov z 20 čerstvých dní od 100 tis. / 1 mil. EUR získa 2 / 4 body. Nulové AUM a nulový objem sú chýbajúce údaje.",
              "Štruktúra (10): plná fyzická replikácia 3, výber vzorky alebo fond fondov 2, syntetická 1, opčná alebo páková 0. Potvrdený UCITS má 3 body; vek od 1 / 3 / 5 rokov má 1 / 2 / 3 body. Domicil má najviac 1 bod podľa podkladovej americkej akciovej expozície. Text o replikácii je uložený v katalógu, nie potvrdený správcom.",
              "Trend (5): pri najmenej 200 čerstvých cenách sa hodnotí cena nad 200-dňovým priemerom s pásmom 2 %, vzťah 50- a 200-dňového priemeru, výnos 12 až 1 mesiac a ročný pokles akciového fondu. Posledná cena musí byť nanajvýš 7 dní stará.",
              "Mimo rozsahu sú ETN, ETC, pákové a inverzné fondy a opčné stratégie. Známy TER nad 1,50 %, AUM pod 20 mil. EUR, vek pod rok alebo hodnota obchodov pod 100 tis. EUR znamenajú nesplnené pravidlo. Cena pod oboma priemermi znamená prerušený trend. Pri AUM pod 50 mil. EUR sa zobrazuje Upozornenie. Tieto stavy skryjú percento okrem Upozornenia.",
            ] : [
              "Cost (10): TER at or below 0.10% / 0.20% / 0.30% / 0.50% / 0.75% earns 10 / 8 / 6 / 4 / 2 points; higher TER earns 0. Zero or missing TER is a missing fact.",
              "Size and trading volume (10): AUM in EUR at or above 50m / 100m / 500m / 1bn earns 1 / 3 / 5 / 6 points. Median daily close × volume from 20 fresh bars at or above EUR 100k / 1m earns 2 / 4 points. Zero AUM or volume is missing data.",
              "Structure (10): full physical replication earns 3, sampling or fund of funds 2, synthetic 1, and options or leverage overlay 0. Confirmed UCITS earns 3; age at or above 1 / 3 / 5 years earns 1 / 2 / 3. Domicile earns up to 1 point according to underlying US equity exposure. Replication text comes from the stored catalog and is not issuer-confirmed.",
              "Trend (5): at least 200 fresh prices support the close above the 200-day average with a 2% band, the 50- versus 200-day average, the 12-to-1-month return and one-year equity drawdown. The latest price must be no more than seven days old.",
              "ETNs, ETCs, leveraged or inverse funds and options strategies are out of scope. Known TER above 1.50%, AUM below EUR 20m, age under one year or trading value below EUR 100k fails a rule. A close below both averages marks a broken trend. AUM below EUR 50m adds a Caution state. Failed, out-of-scope and broken-trend results hide the percentage.",
            ]).map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="prose">{locale === "sk" ? "Prahy a body sú pravidlá produktu. Podklady k smeru pravidiel:" : "The bands and points are product rules. Sources for the criteria:"}</p>
          <ul className="rp-list">
            <li><a href="https://www.justetf.com/en-de/academy/make-the-right-etf-selection.html">{locale === "sk" ? "justETF, výber ETF" : "justETF, ETF selection"}</a></li>
            <li><a href="https://www.justetf.com/en/academy/die-richtige-etf-auswahl.html">{locale === "sk" ? "justETF, kritériá výberu" : "justETF, selection criteria"}</a></li>
            <li><a href="https://www.morningstar.com/funds/etfs-2023-tale-success-failure">{locale === "sk" ? "Morningstar, zánik ETF" : "Morningstar, ETF closures"}</a></li>
            <li><a href="https://www.morningstar.com/funds/why-funds-die">{locale === "sk" ? "Morningstar, prečo fondy zanikajú" : "Morningstar, why funds close"}</a></li>
            <li><a href="https://www.ssga.com/us/en/individual/insights/how-to-evaluate-etfs-6-things-that-matter-most">{locale === "sk" ? "State Street, hodnotenie ETF" : "State Street, ETF evaluation"}</a></li>
            <li><a href="https://www.ssga.com/us/en/institutional/insights/considerations-for-non-us-investors-us-etfs-vs-irish-ucits">{locale === "sk" ? "State Street, americké ETF a írske UCITS" : "State Street, US ETFs and Irish UCITS"}</a></li>
            <li><a href="https://www.wisdomtree.com/gb/insights/blog/dispelling-the-myth-etf-trading-volume-does-not-equal-etf-liquidity">{locale === "sk" ? "WisdomTree, objem obchodovania a likvidita" : "WisdomTree, trading volume and liquidity"}</a></li>
            <li><a href="https://www.esma.europa.eu/sites/default/files/library/2015/11/2012-44_0.pdf">{locale === "sk" ? "ESMA, usmernenia pre ETF" : "ESMA, ETF guidelines"}</a></li>
            <li><a href="https://mebfaber.com/2007/02/10/published-errrsort-of/">Faber, A Quantitative Approach to Tactical Asset Allocation, The Journal of Wealth Management (2007)</a></li>
            <li><a href="https://alphaarchitect.com/2014/09/are-uber-simple-asset-allocation-systems-robust/">{locale === "sk" ? "Faber, komentár k trendovým pravidlám" : "Faber, trend-rule commentary"}</a></li>
          </ul>
        </RecordCard>
      </ReadingLayout>
    </article>
  );
}

export default withPageLog("/methodology", Methodology);

export const dynamic = "force-dynamic";
