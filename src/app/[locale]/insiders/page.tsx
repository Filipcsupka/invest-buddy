import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import { InsiderPanel } from "@/components/insider-panel";
import { flags } from "@/config/flags";
import { insiderEvents } from "@/db/insiders";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return { ...pageMetadata(locale, "/insiders", m.meta.insidersTitle, m.meta.insidersDescription), robots: { index: flags().INSIDERS_PAGE, follow: flags().INSIDERS_PAGE } };
}

async function Insiders({ params, searchParams }: LocaleParams & { searchParams?: Promise<{ ticker?: string | string[] }> }) {
  const locale = await resolveLocale(params);
  if (!flags().INSIDERS_PAGE) notFound();
  const m = getMessages(locale);
  const raw = (await searchParams)?.ticker;
  const ticker = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase().slice(0, 12);
  const events = await insiderEvents(ticker || undefined);
  return <div className="frame page">
    <header className="page-head">
      <h1 className="title">{m.insiders.title}</h1>
      <p className="lede">{m.insiders.lede}</p>
      <Disclaimer text={m.common.disclaimer} />
    </header>
    <p className="notice">{m.insiders.note}</p>
    <InsiderPanel locale={locale} events={events} />
    <section className="sheet-section insider-codes" aria-labelledby="form4-codes">
      <h2 id="form4-codes">{m.insiders.codesTitle}</h2>
      <ul>{Object.values(m.insiders.codes).map((description) => <li key={description}>{description}</li>)}</ul>
    </section>
  </div>;
}

export default withPageLog("/insiders", Insiders);
