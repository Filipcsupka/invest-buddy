import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/legal/terms", m.meta.termsTitle, m.legal.termsBody);
}

export default async function Terms({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return (
    <article className="frame page reading">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.meta.termsTitle}</h1>
          <span className="stamp">{m.legal.draft}</span>
        </div>
        <p className="prose">{m.legal.termsBody}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>
    </article>
  );
}
