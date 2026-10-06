import { permanentRedirect } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";

export default async function Scanner({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  permanentRedirect(`/${locale}/dashboard`);
}
