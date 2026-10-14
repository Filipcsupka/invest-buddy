import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { ConfirmPanel } from "@/components/waitlist-status";
import { flags } from "@/config/flags";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { confirmView } from "@/waitlist/states";
import { waitlistDeps } from "@/waitlist/runtime";
import { resolveLocale, type LocaleParams } from "../../locale";

type Props = LocaleParams & { searchParams?: Promise<{ token?: string | string[]; result?: string | string[] }> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale).waitlist;
  // Link pages are never indexed.
  return { ...pageMetadata(locale, "/waitlist/confirm", m.confirmTitle, m.confirmBody), robots: { index: false, follow: false } };
}

async function Confirm({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  if (!flags().WAITLIST) notFound();
  const query = await searchParams;
  const token = one(query?.token) ?? "";
  const deps = waitlistDeps();
  if (!deps) notFound();
  const view = await confirmView(deps, token, one(query?.result));
  return <ConfirmPanel locale={locale} labels={getMessages(locale).waitlist} view={view} token={token} />;
}

export default withPageLog("/waitlist/confirm", Confirm);

export const dynamic = "force-dynamic";
