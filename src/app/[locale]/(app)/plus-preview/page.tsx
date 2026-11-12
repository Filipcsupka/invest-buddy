import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/i18n";
import { getNavSectionsMessages } from "@/i18n/nav-sections-messages";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { getIdentityMessages } from "@/i18n/identity-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

type Props = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const navKeys = {
  dashboard: "dashboard", company: "dashboard", stocks: "stocks", scanner: "scanner", ideas: "ideas", "track-record": "trackRecord", insiders: "insiders", portfolio: "portfolio",
  etf: "etfResearch", "etf/track-record": "etfTrackRecord", indices: "indices", calendar: "economy", economy: "economy", congress: "congress", news: "news", screener: "screener",
} as const;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getIdentityMessages(locale).plusPage;
  return { ...pageMetadata(locale, "/plus-preview", t.title, t.body), robots: { index: false, follow: false } };
}

export default async function PlusPreview({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams) ?? {};
  const raw = Array.isArray(query.page) ? query.page[0] : query.page;
  const t = getIdentityMessages(locale).plusPage;
  const key = raw && Object.prototype.hasOwnProperty.call(t.areas, raw) ? raw as keyof typeof t.areas : null;
  const nav = getMessages(locale).nav;
  const name = key === "heatmap" ? getHeatmapMessages(locale).navLabel : key === "calendar" ? getNavSectionsMessages(locale).calendar : key ? nav[navKeys[key as keyof typeof navKeys]] : null;
  const description = key ? t.areas[key] : t.body;
  return <article className="frame page">
    <section className="kit-card" style={{ display: "grid", gap: "var(--s4)", maxWidth: "40rem", padding: "var(--s6)" }}>
      <h1 className="title" style={{ margin: 0 }}>{t.title}</h1>
      {name && <h2 style={{ margin: 0 }}>{name}</h2>}
      <p style={{ margin: 0 }}>{description}</p>
      <div aria-label={t.sample} style={{ border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "var(--s5)", background: "var(--sheet)" }}>
        <span className="stamp">{t.sample}</span>
        <p className="muted" style={{ marginBlockEnd: 0 }}>{description}</p>
      </div>
      <p style={{ margin: 0 }}>{t.price}</p>
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="button cta" href={`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/plus-preview${key ? `?page=${key}` : ""}`)}`}>{t.create}</Link>
        <Link className="button secondary" href={`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/plus-preview${key ? `?page=${key}` : ""}`)}&mode=sign-in`}>{t.signIn}</Link>
      </div>
    </section>
  </article>;
}
