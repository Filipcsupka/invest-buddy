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
import { resolveLocale, type LocaleParams } from "../locale";
import { profileCopy } from "@/i18n/profile-messages";

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
      </ReadingLayout>
    </article>
  );
}

export default withPageLog("/methodology", Methodology);

export const dynamic = "force-dynamic";
