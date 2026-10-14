import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { getLegalMessages } from "@/i18n/legal-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getLegalMessages(locale).terms;
  return pageMetadata(locale, "/legal/terms", t.title, t.lede);
}

async function Terms({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return <LegalPage locale={locale} doc="terms" />;
}

export default withPageLog("/legal/terms", Terms);

export const dynamic = "force-dynamic";
