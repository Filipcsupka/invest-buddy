import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { assertViewable } from "@/markets/gate";
import { upcomingCalendar } from "@/data/calendar-view";
import { getCalendarMessages } from "@/i18n/calendar-messages";
import { DataTable } from "@/components/kit";
import { RecordCard, RecordHead } from "@/components/record-parts";
import "@/components/record-pages.css";

export const dynamic = "force-dynamic";
const sessionLabel = (value: string | null, m: ReturnType<typeof getCalendarMessages>) => {
  switch (value?.toLowerCase()) {
    case "aftermarket":
    case "post-market": return m.postMarket;
    case "beforemarket":
    case "pre-market": return m.preMarket;
    default: return m.unknown;
  }
};
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getCalendarMessages(locale);
  return { ...pageMetadata(locale, "/calendar", m.title, m.lede), robots: { index: false, follow: false } };
}
async function CalendarPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  await assertViewable();
  const m = getCalendarMessages(locale);
  const today = new Date().toISOString().slice(0, 10);
  const { earnings, macro } = await upcomingCalendar(today);
  return <div className="frame page">
    <RecordHead title={m.title} lede={m.lede} />
    <RecordCard id="earnings" title={m.earnings} flush>
      {earnings.length ? <DataTable label={m.earnings} density="compact"><thead><tr><th scope="col">{m.date}</th><th scope="col">{m.ticker}</th><th scope="col">{m.time}</th></tr></thead><tbody>{earnings.map((row) => <tr key={`${row.ticker}-${row.date}`}><td>{row.date}</td><td><Link href={`/${locale}/company/${encodeURIComponent(row.ticker)}`}>{row.ticker}</Link></td><td>{sessionLabel(row.timeOfDay, m)}</td></tr>)}</tbody></DataTable> : <p>{m.emptyEarnings}</p>}
      {earnings.length === 100 && <p className="notice">{m.earningsLimit}</p>}
    </RecordCard>
    <RecordCard id="macro" title={m.macro} flush>
      {macro.length ? <DataTable label={m.macro} density="compact"><thead><tr><th scope="col">{m.date}</th><th scope="col">{m.event}</th></tr></thead><tbody>{macro.map((row) => <tr key={`${row.kind}-${row.date}`}><td>{row.date}</td><td>{m.macroKinds[row.kind as keyof typeof m.macroKinds] ?? row.label}</td></tr>)}</tbody></DataTable> : <p>{m.emptyMacro}</p>}
    </RecordCard>
    <p className="disclaimer">{m.note}</p>
  </div>;
}
export default withPageLog("/calendar", CalendarPage);
