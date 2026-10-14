import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { TrackView } from "@/components/track-view";
import { WaitlistForm } from "@/components/waitlist-form";
import { flags } from "@/config/flags";
import { getMessages } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveSource } from "@/waitlist/source";
import { notFound } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";

type PricingProps = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getLaunchMessages(locale);
  return pageMetadata(locale, "/pricing", t.pricing.title, t.pricing.lede);
}

async function Pricing({ params, searchParams }: PricingProps) {
  const locale = await resolveLocale(params);
  // The page exists only while the waitlist is open to the public. The proxy answers 404 first.
  if (!flags().WAITLIST) notFound();
  const m = getMessages(locale);
  const p = getLaunchMessages(locale).pricing;
  const source = resolveSource(await searchParams, "pricing");
  return (
    <article className="frame page reading">
      <TrackView events={["pricing_view"]} props={{ locale }} />
      <header className="page-head">
        <h1 className="title">{p.title}</h1>
        <p className="lede">{p.lede}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>
      <section aria-labelledby="free">
        <h2 id="free">{p.freeTitle}</h2>
        <p className="prose">{p.freeBody}</p>
      </section>
      <section aria-labelledby="later">
        <h2 id="later">{p.laterTitle}</h2>
        <p className="prose">{p.laterBody}</p>
      </section>
      <section aria-labelledby="join">
        <h2 id="join">{p.waitlistTitle}</h2>
        <WaitlistForm locale={locale} labels={m.waitlist} source={source} hideTitle />
      </section>
    </article>
  );
}

export default withPageLog("/pricing", Pricing);
