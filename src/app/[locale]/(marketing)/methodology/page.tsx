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
          <p className="prose">{locale === "sk" ? `Verzia ${ETF_RULES_VERSION}. Informačné hodnotenie delí získané body doloženými bodmi. Potrebné sú náklady, veľkosť a dve zo skupín likvidita, štruktúra, diverzifikácia, trend alebo riziko. Akumulačné fondy nemajú skupinu výnosov. Pásma sú Spĺňa pravidlá od 72 %, Väčšinou spĺňa od 60 %, Čiastočne spĺňa od 48 % a Spĺňa málo pravidiel pod 48 %. Pri menej ako 70 doložených bodoch je najvyššie pásmo Väčšinou spĺňa a zobrazuje sa Neúplné údaje.` : `Version ${ETF_RULES_VERSION}. This informational rating divides earned points by evidenced points. It needs Cost, Size and two of Liquidity, Structure, Diversification, Trend or Risk. Accumulating funds have no Income group. Bands are Rules met from 72%, Mostly met from 60%, Partly met from 48%, and Few met below 48%. With fewer than 70 evidenced points, the highest band is Mostly met and Incomplete data is shown.`}</p>
          <ul className="rp-list">
            {(locale === "sk" ? [
              "Náklady (20): TER (12) a náklady oproti podobným fondom (8).",
              "Veľkosť a vek (12): aktíva v EUR (8) a vek fondu (4).",
              "Likvidita (12): medián obchodovanej hodnoty za 20 dní (8) a denné cenové rozpätie (4).",
              "Štruktúra (10): plná replikácia získa 4 body, výber vzorky či fond fondov 3, syntetická 1. Údaj UCITS získa 3, náhradný údaj podľa domicilu 2; domicil a sledovaný index najviac 2 a 1 bod. Pri americkej akciovej expozícii nad 50 % získa domicil 2 body len pre Írsko. Text o replikácii nie je potvrdený správcom.",
              "Diverzifikácia (14): počet pozícií (4), desať najväčších pozícií (4), najväčší sektor (3) a krajina alebo región (3).",
              "Trend (12): cena oproti 200-dňovému priemeru (3), 50-dňový oproti 200-dňovému priemeru (2), výnos 12 až 1 mesiac (3) a šesťmesačný výnos oproti dostupnej porovnávacej sérii pri akciových fondoch (4). Svetové fondy používajú cenové série ETF v mene fondu: ACWI.US alebo URTH.US pre USD, IUSQ.XETRA alebo EUNL.XETRA pre EUR. Pri iných menách porovnávacia séria chýba.",
              "Riziko (12): ročná volatilita (4), trojročný Sharpeho pomer (4) a najväčší trojročný pokles (4).",
              "Výnosy (8, len distribučné fondy): výnos (4) a aspoň štyri výplaty za rok alebo uvedená mesačná či štvrťročná frekvencia (4).",
              "Prahy nákladov: TER do 0,10 / 0,20 / 0,30 / 0,50 / 0,75 % získa 12 / 10 / 8 / 5 / 2 bodov. Nákladové poradie medzi aspoň piatimi podobnými fondmi do 25. / 50. / 75. percentilu získa 8 / 5 / 2 body.",
              "Prahy veľkosti a likvidity: AUM od 1 mld. / 500 mil. / 250 mil. / 100 mil. / 50 mil. EUR získa 8 / 6 / 4 / 3 / 1 bod. Vek od 5 / 3 / 1 roka získa 4 / 3 / 1 bod. Obchodovaná hodnota od 5 mil. / 1 mil. / 250 tis. / 100 tis. EUR získa 8 / 6 / 4 / 2 body. Denné rozpätie do 0,5 / 1 % získa 4 / 2 body.",
              "Prahy diverzifikácie: aspoň 100 / 50 / 20 pozícií získa 4 / 3 / 2 body; desať najväčších pozícií do 20 / 35 / 50 % získa 4 / 3 / 2. Najväčší sektor do 30 / 50 % získa 3 / 2 a najväčšia krajina alebo región do 60 / 80 % získa 3 / 2 body.",
              "Prahy trendu a rizika: cena nad 200-dňovým priemerom o 2 %, 50-dňový priemer nad 200-dňovým a kladný výnos 12 až 1 mesiac získajú 3 / 2 / 3 body. Akciový fond získava 4 body za šesťmesačný výnos nad dostupnou porovnávacou sériou. Volatilita akcií do 15 / 20 / 25 % a dlhopisov či peňažných fondov do 5 / 8 / 12 % získa 4 / 3 / 1 bod. Sharpeho pomer od 1 / 0,5 / 0 získa 4 / 3 / 1. Trojročný pokles lepší než -20 / -30 % pri akciách alebo -10 / -15 % pri dlhopisoch získa 4 / 2 body. Výnos od 1,5 / 0,5 % získa 4 / 2 body.",
              "ETN, ETC, pákové a inverzné fondy či opčné stratégie sú mimo rozsahu. TER nad 1,50 %, AUM pod 20 mil. EUR, vek pod rok, obchodovaná hodnota pod 100 tis. EUR, nesúlad ISIN, stav not_etf alebo posledný výskyt starší než 30 dní znamenajú nesplnené pravidlo. Cena pod oboma priemermi znamená prerušený trend. Pri AUM pod 50 mil. EUR sa zobrazí Upozornenie. Mimo rozsahu, nesplnené pravidlo, prerušený trend a nedostatok údajov skryjú percento.",
            ] : [
              "Cost (20): absolute TER (12) and TER among comparable funds (8).",
              "Size and age (12): assets in EUR (8) and fund age (4).",
              "Liquidity (12): median 20-day traded value (8) and daily price range (4).",
              "Structure (10): full replication earns 4 points, sampling or fund of funds 3, and synthetic 1. A UCITS hint earns 3 or eligible domicile fallback 2; domicile and a named index earn up to 2 and 1. For US equity exposure above 50%, only Irish domicile earns the 2 points. Replication text is not issuer-confirmed.",
              "Diversification (14): holdings count (4), top-ten weight (4), largest sector (3) and country or region (3).",
              "Trend (12): price against the 200-day average (3), 50-day against 200-day average (2), 12-to-1-month return (3) and six-month return against an available benchmark proxy for equity funds (4). World funds use currency-matched ETF price series: ACWI.US or URTH.US for USD, IUSQ.XETRA or EUNL.XETRA for EUR. Other currencies keep a missing benchmark proxy.",
              "Risk (12): one-year volatility (4), three-year Sharpe ratio (4) and three-year maximum drawdown (4).",
              "Income (8, distributing funds only): yield (4) and at least four payments in a year or a stated monthly or quarterly frequency (4).",
              "Cost thresholds: TER at or below 0.10 / 0.20 / 0.30 / 0.50 / 0.75% earns 12 / 10 / 8 / 5 / 2 points. TER rank among at least five peers at or below the 25th / 50th / 75th percentile earns 8 / 5 / 2.",
              "Size and liquidity thresholds: AUM at or above EUR 1bn / 500m / 250m / 100m / 50m earns 8 / 6 / 4 / 3 / 1 points. Age at or above 5 / 3 / 1 years earns 4 / 3 / 1. Traded value at or above EUR 5m / 1m / 250k / 100k earns 8 / 6 / 4 / 2. Daily range at or below 0.5 / 1% earns 4 / 2.",
              "Diversification thresholds: at least 100 / 50 / 20 holdings earns 4 / 3 / 2 points; top-ten weight at or below 20 / 35 / 50% earns 4 / 3 / 2. Largest sector at or below 30 / 50% earns 3 / 2, and largest country or region at or below 60 / 80% earns 3 / 2.",
              "Trend and risk thresholds: price more than 2% above the 200-day average, the 50-day average above the 200-day average, and positive 12-to-1-month return earn 3 / 2 / 3 points. Equity funds earn 4 for six-month return above an available benchmark proxy. Equity volatility at or below 15 / 20 / 25% and bond or money-market volatility at or below 5 / 8 / 12% earns 4 / 3 / 1. Sharpe at or above 1 / 0.5 / 0 earns 4 / 3 / 1. Three-year drawdown better than -20 / -30% for equity or -10 / -15% for bonds earns 4 / 2. Yield at or above 1.5 / 0.5% earns 4 / 2.",
              "ETNs, ETCs, leveraged or inverse funds and options strategies are out of scope. TER above 1.50%, AUM below EUR 20m, age under one year, traded value below EUR 100k, ISIN mismatch, not_etf status or a listing unseen for more than 30 days fails a rule. A close below both averages marks a broken trend. AUM below EUR 50m adds Caution. Failed, out-of-scope, broken-trend and insufficient-data results hide the percentage.",
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
