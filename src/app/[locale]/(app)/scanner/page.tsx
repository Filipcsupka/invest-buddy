import { redirect } from "next/navigation";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";

type Props = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export default async function ScannerRedirect({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  redirect(`/${locale}/stocks${query.size ? `?${query}` : ""}`);
}
