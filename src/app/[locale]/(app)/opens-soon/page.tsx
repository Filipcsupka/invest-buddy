import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/i18n";
import { getIdentityMessages } from "@/i18n/identity-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

type Props = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getIdentityMessages(locale).soonPage;
  return { ...pageMetadata(locale, "/opens-soon", t.title, t.body), robots: { index: false, follow: false } };
}

/** Section names from the nav messages, so the page can say which item was locked. Unknown values show no name. */
function sectionName(locale: "en" | "sk", raw: string | undefined): string | null {
  const nav = getMessages(locale).nav as Record<string, string>;
  const keys: Record<string, string> = {
    dashboard: "dashboard", scanner: "scanner", ideas: "ideas", "track-record": "trackRecord", insiders: "insiders", portfolio: "portfolio",
    etf: "etfResearch", indices: "indices", forex: "forex", crypto: "crypto", economy: "economy", congress: "congress", news: "news", screener: "screener",
    heatmap: "heatmap", company: "dashboard",
  };
  const key = raw ? keys[raw] : undefined;
  return key && typeof nav[key] === "string" ? nav[key] : null;
}

/** The plain card a locked nav item opens. It shows no data at all, sample or real. */
export default async function OpensSoon({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams) ?? {};
  const raw = Array.isArray(query.page) ? query.page[0] : query.page;
  const t = getIdentityMessages(locale).soonPage;
  const name = sectionName(locale, raw);
  return (
    <article className="frame page">
      <section className="kit-card" style={{ display: "grid", gap: "var(--s4)", maxWidth: "36rem", padding: "var(--s6)" }}>
        <h1 className="title" style={{ margin: 0 }}>{t.title}</h1>
        {name && <p className="muted" style={{ margin: 0 }}>{t.named.replace("{page}", name)}</p>}
        <p style={{ margin: 0 }}>{t.body}</p>
        <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--s3)", margin: 0 }}>
          <Link className="button secondary" href={`/${locale}/account`}>{t.back}</Link>
          <Link className="button secondary" href={`/${locale}/methodology`}>{t.methodology}</Link>
        </p>
      </section>
    </article>
  );
}
