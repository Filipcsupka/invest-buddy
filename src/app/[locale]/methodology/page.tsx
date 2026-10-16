import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { RuleBook, StatusLegend } from "@/components/method";
import { flags } from "@/config/flags";
import { RULESET_DATE, RULESET_VERSION } from "@/config/rules";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/methodology", m.meta.methodologyTitle, m.meta.methodologyDescription);
}

async function Methodology({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return (
    <article className="frame page reading">
      <header className="page-head">
        <h1 className="title">{m.methodology.title}</h1>
        <p className="lede">{m.methodology.lede}</p>
        <p className="prose">{m.methodology.versionLine.replace("{version}", RULESET_VERSION).replace("{date}", RULESET_DATE)}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>

      <section aria-labelledby="score">
        <h2 id="score">{m.methodology.scoreTitle}</h2>
        <p className="prose">{m.methodology.scoreBody}</p>
        <RuleBook locale={locale} definitions />
      </section>

      <section aria-labelledby="states">
        <h2 id="states">{m.status.legendTitle}</h2>
        <StatusLegend locale={locale} adviceOutput={flags().ADVICE_OUTPUT} />
      </section>

      <section aria-labelledby="rejection">
        <h2 id="rejection">{m.methodology.rejectionTitle}</h2>
        <p className="prose">{m.methodology.rejectionBody}</p>
        <p className="prose">{m.methodology.historyBody}</p>
      </section>

      <section aria-labelledby="worked">
        <h2 id="worked">{m.methodology.workedTitle}</h2>
        <p className="prose">{m.methodology.workedBody}</p>
        <p className="prose">{m.methodology.workedCap}</p>
      </section>

      <section aria-labelledby="source-labels">
        <h2 id="source-labels">{m.sources.legendTitle}</h2>
        <ul className="prose">
          {([m.sources.legendComputed, m.sources.legendSec, m.sources.legendTwo, m.sources.legendChecked, m.sources.legendSingle, m.sources.legendUnknown]).map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits">{m.methodology.limitsTitle}</h2>
        <p className="prose">{m.methodology.limitsBody}</p>
      </section>

      <section aria-labelledby="data">
        <h2 id="data">{m.methodology.dataTitle}</h2>
        <p className="prose">{process.env.DATA_MODE === "fixture" ? m.methodology.dataBody : m.methodology.dataBodyLive}</p>
      </section>
    </article>
  );
}

export default withPageLog("/methodology", Methodology);

export const dynamic = "force-dynamic";
