import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/legal/privacy", m.meta.privacyTitle, m.legal.privacyBody);
}

async function Privacy({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return (
    <article className="frame page reading">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.meta.privacyTitle}</h1>
          <span className="stamp">{m.legal.draft}</span>
        </div>
        <p className="prose">{m.legal.privacyBody}</p>
      </header>
    </article>
  );
}

export default withPageLog("/legal/privacy", Privacy);

export const dynamic = "force-dynamic";
