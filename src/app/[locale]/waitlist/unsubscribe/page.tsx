import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { UnsubscribePanel } from "@/components/waitlist-status";
import { flags } from "@/config/flags";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { unsubscribeView } from "@/waitlist/states";
import { waitlistDeps } from "@/waitlist/runtime";
import { resolveLocale, type LocaleParams } from "../../locale";

type Props = LocaleParams & { searchParams?: Promise<{ token?: string | string[]; result?: string | string[] }> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale).waitlist;
  // Link pages are never indexed.
  return { ...pageMetadata(locale, "/waitlist/unsubscribe", m.unsubscribeTitle, m.unsubscribeBody), robots: { index: false, follow: false } };
}

async function Unsubscribe({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  if (!flags().WAITLIST) notFound();
  const query = await searchParams;
  const token = one(query?.token) ?? "";
  let deps: ReturnType<typeof waitlistDeps> = null;
  try { deps = waitlistDeps(); } catch { deps = null; }
  if (!deps) notFound();
  const view = unsubscribeView(deps, token, one(query?.result));
  return <UnsubscribePanel locale={locale} labels={getMessages(locale).waitlist} view={view} token={token} />;
}

export default withPageLog("/waitlist/unsubscribe", Unsubscribe);

export const dynamic = "force-dynamic";
