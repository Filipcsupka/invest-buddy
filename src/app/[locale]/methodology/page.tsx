import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { RuleBook, StateScale } from "@/components/method";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/methodology", m.meta.methodologyTitle, m.meta.methodologyDescription);
}

export default async function Methodology({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return (
    <article className="frame page reading">
      <header className="page-head">
        <h1 className="title">{m.methodology.title}</h1>
        <p className="lede">{m.methodology.lede}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>

      <section aria-labelledby="score">
        <h2 id="score">{m.methodology.scoreTitle}</h2>
        <p className="prose">{m.methodology.scoreBody}</p>
        <RuleBook locale={locale} definitions />
      </section>

      <section aria-labelledby="states">
        <h2 id="states">{m.methodology.statesTitle}</h2>
        <StateScale locale={locale} />
      </section>

      <section aria-labelledby="rejection">
        <h2 id="rejection">{m.methodology.rejectionTitle}</h2>
        <p className="prose">{m.methodology.rejectionBody}</p>
        <p className="prose">{m.methodology.historyBody}</p>
      </section>

      <section aria-labelledby="data">
        <h2 id="data">{m.methodology.dataTitle}</h2>
        <p className="prose">{m.methodology.dataBody}</p>
      </section>
    </article>
  );
}
