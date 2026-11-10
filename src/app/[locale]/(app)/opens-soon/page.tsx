import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getIdentityMessages } from "@/i18n/identity-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

type Props = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getIdentityMessages(locale).plusPage;
  return { ...pageMetadata(locale, "/opens-soon", t.title, t.body), robots: { index: false, follow: false } };
}

/** Keep old links and proxy redirects working while the preview gets its own URL. */
export default async function OldPreview({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams) ?? {};
  const raw = Array.isArray(query.page) ? query.page[0] : query.page;
  redirect(`/${locale}/plus-preview${raw ? `?page=${encodeURIComponent(raw)}` : ""}`);
}
