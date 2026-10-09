import { withPageLog } from "@/app/page-log";
import { notFound } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";

async function Scanner({ params }: LocaleParams) {
  await resolveLocale(params);
  notFound();
}

export default withPageLog("/scanner", Scanner);

export const dynamic = "force-dynamic";
