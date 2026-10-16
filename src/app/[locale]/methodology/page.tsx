import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable, ScoreBar, SectionHead, StateChip } from "@/components/kit";
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
    { id: "rejection", label: m.methodology.rejectionTitle },
    { id: "worked", label: m.methodology.workedTitle },
    { id: "source-labels", label: m.sources.legendTitle },
    { id: "limits", label: m.methodology.limitsTitle },
    { id: "data", label: m.methodology.dataTitle },
  ];
  const sourceLines = [m.sources.legendComputed, m.sources.legendSec, m.sources.legendTwo, m.sources.legendChecked, m.sources.legendSingle, m.sources.legendUnknown];
  return (
    <article className="frame page rp-article">
      <header className="page-head">
        <h1 className="title">{m.methodology.title}</h1>
        <p className="lede">{m.methodology.lede}</p>
        <p className="rp-version">{m.methodology.versionLine.replace("{version}", RULESET_VERSION).replace("{date}", RULESET_DATE)}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>

      <ReadingLayout locale={locale} toc={toc}>
        <section aria-labelledby="score">
          <SectionHead id="score" title={m.methodology.scoreTitle} />
          <p className="prose">{m.methodology.scoreBody}</p>
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
                    <td className="num rp-weight">+{rule.points}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </DataTable>
        </section>

        <section aria-labelledby="states">
          <SectionHead id="states" title={m.status.legendTitle} lede={m.status.legendLede} />
          <DataTable label={m.status.legendTitle} bounded={false}>
            <thead>
              <tr>
                <th scope="col">{m.status.legendStep}</th>
                <th scope="col" className="rp-range">{rp.stepPoints}</th>
                <th scope="col">{m.status.legendMeaning}</th>
              </tr>
            </thead>
            <tbody>
              {bandOrder.map((state) => (
                <tr key={state} data-state={state}>
                  <th scope="row"><StateChip state={state} label={m.status.labels[state]} /></th>
                  <td className="rp-range">{m.status.ranges[state]}</td>
                  <td className="rp-meaning">
                    {m.status.meaning[state]}
                    {state === "broken" ? <> <a href="#rejection">{m.methodology.rejectionTitle}</a></> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <div className="rp-prose-block">
            <SectionHead as="h3" title={m.status.legendMissingTitle} rule="quiet" />
            <p className="prose">{m.status.legendMissing}</p>
            <SectionHead as="h3" title={m.status.legendConfirmTitle} rule="quiet" />
            <p className="prose">{m.status.legendConfirm}</p>
          </div>
        </section>

        <section aria-labelledby="rejection">
          <SectionHead id="rejection" title={m.methodology.rejectionTitle} />
          <p className="prose">{m.methodology.rejectionBody}</p>
          <p className="prose">{m.methodology.historyBody}</p>
        </section>

        <section aria-labelledby="worked">
          <SectionHead id="worked" title={m.methodology.workedTitle} />
          <p className="prose">{m.methodology.workedBody}</p>
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
        </section>

        <section aria-labelledby="source-labels">
          <SectionHead id="source-labels" title={m.sources.legendTitle} />
          <ul className="rp-list">
            {sourceLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>

        <section aria-labelledby="limits" className="rp-limits">
          <SectionHead id="limits" title={m.methodology.limitsTitle} rule="quiet" />
          <p className="prose">{m.methodology.limitsBody}</p>
        </section>

        <section aria-labelledby="data">
          <SectionHead id="data" title={m.methodology.dataTitle} />
          <p className="prose">{process.env.DATA_MODE === "fixture" ? m.methodology.dataBody : m.methodology.dataBodyLive}</p>
        </section>
      </ReadingLayout>
    </article>
  );
}

export default withPageLog("/methodology", Methodology);

export const dynamic = "force-dynamic";
