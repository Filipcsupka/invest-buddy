import { notFound } from "next/navigation";
import { getMessages, isLocale } from "@/i18n";
import { homeImage, OG_CONTENT_TYPE, OG_SIZE } from "@/og/card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "InvestBuddy";

/** Link preview for the site and every page without its own image. Copy only, no data read. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  return homeImage({ siteName: m.meta.siteName, tagline: m.meta.homeTitle });
}
