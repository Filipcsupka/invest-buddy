import { withPageLog } from "@/app/page-log";
import { permanentRedirect } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";

async function Scanner({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  permanentRedirect(`/${locale}/dashboard`);
}

export default withPageLog("/scanner", Scanner);

export const dynamic = "force-dynamic";
