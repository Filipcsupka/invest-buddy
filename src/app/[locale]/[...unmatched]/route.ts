import { statusPage } from "@/app/status-page";
import { resolveRequestId } from "@/app/request-id";
import { defaultLocale, isLocale } from "@/i18n";

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return statusPage("notFound", 404, isLocale(locale) ? locale : defaultLocale, resolveRequestId(request.headers));
}
