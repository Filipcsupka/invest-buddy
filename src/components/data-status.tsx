import { fill, formatDate, getMessages, type Locale } from "@/i18n";
export function DataStatus({ locale, lastUpdated, stale }: { locale: Locale; lastUpdated: string | null; stale: boolean }) {
  const m = getMessages(locale).common;
  return <>
    {!lastUpdated && <p className="notice">{m.noDataYet}</p>}
    {lastUpdated && <p className="muted small">{fill(m.lastUpdated, { date: formatDate(locale, lastUpdated) })}</p>}
    {stale && lastUpdated && <p className="notice" role="status">{fill(m.staleData, { date: formatDate(locale, lastUpdated) })}</p>}
  </>;
}
