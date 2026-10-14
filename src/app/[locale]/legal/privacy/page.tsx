import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { getLegalMessages } from "@/i18n/legal-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getLegalMessages(locale).privacy;
  return pageMetadata(locale, "/legal/privacy", t.title, t.lede);
}

async function Privacy({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return <LegalPage locale={locale} doc="privacy" />;
}

export default withPageLog("/legal/privacy", Privacy);

export const dynamic = "force-dynamic";
