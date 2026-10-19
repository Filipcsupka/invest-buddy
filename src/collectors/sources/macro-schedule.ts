import type { MacroEventKind } from "../../data/macro-calendar";
import { validSecUserAgent } from "../sec-user-agent";
import type { SourceHttp } from "./client";
import { FOMC_URL, parseMeetings } from "./fed";

/** BLS schedule page per release. The pages list the release dates of the current and the next year once BLS publishes them. */
export const BLS_SCHEDULE_PAGES: Record<"CPI" | "PPI" | "NFP", { url: string; label: string }> = {
  CPI: { url: "https://www.bls.gov/schedule/news_release/cpi.htm", label: "CPI" },
  PPI: { url: "https://www.bls.gov/schedule/news_release/ppi.htm", label: "PPI" },
  NFP: { url: "https://www.bls.gov/schedule/news_release/empsit.htm", label: "Jobs report" },
};
export const FOMC_PAGE_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

export interface ScheduledRelease { kind: MacroEventKind; date: string; label: string; referencePeriod: string | null; releaseTime: string | null; sourceId: "bls" | "fed"; sourceUrl: string }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const cell = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** "Nov. 10, 2026", "May 07, 2027", "Sept. 3, 2027" to ISO. Null for anything else. */
export function blsDate(text: string): string | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(text.trim());
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) + 1 : 0;
  if (!m || !month) return null;
  const day = Number(m[2]);
  const date = new Date(Date.UTC(Number(m[3]), month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

/** Rows of the `release-list` table: reference month, release date, release time. A row with an unreadable date is skipped. */
export function parseBlsSchedule(html: string, kind: "CPI" | "PPI" | "NFP"): ScheduledRelease[] {
  const table = /<table[^>]*class="release-list"[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (!table) throw new Error(`BLS ${kind} schedule: no release-list table`);
  const page = BLS_SCHEDULE_PAGES[kind];
  const out: ScheduledRelease[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cell(m[1]));
    const date = cells.length >= 2 ? blsDate(cells[1]) : null;
    if (!date) continue;
    const period = cells[0] || null;
    out.push({ kind, date, label: period ? `${page.label} (${period.replace(/\s+\d{4}$/, "")})` : page.label, referencePeriod: period, releaseTime: cells[2] || null, sourceId: "bls", sourceUrl: page.url });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** FOMC decision days (the last day of each meeting) from the Fed calendar file. */
export function parseFomcSchedule(text: string): ScheduledRelease[] {
  return parseMeetings(text).map((meeting) => ({ kind: "FOMC", date: meeting.date, label: "FOMC decision", referencePeriod: null, releaseTime: meeting.time || null, sourceId: "fed", sourceUrl: FOMC_PAGE_URL }));
}

export interface ScheduleResult { kind: MacroEventKind; releases: ScheduledRelease[] }
export interface ScheduleCollection { results: ScheduleResult[]; failures: string[]; requests: number }

/**
 * One GET per BLS page and one for the Fed calendar file. BLS refuses requests without a contact address in the User-Agent,
 * so the BLS pages are sent with SEC_USER_AGENT and skipped when it is not set. A source that fails, or lists no date on or after
 * `today`, is reported as a failure and left out, so the job keeps the stored dates for that kind.
 */
export async function collectMacroSchedule(http: Pick<SourceHttp, "get">, today: string, userAgent: string | undefined): Promise<ScheduleCollection> {
  const results: ScheduleResult[] = [], failures: string[] = [];
  let requests = 0;
  const keep = (kind: MacroEventKind, releases: ScheduledRelease[]) => {
    const upcoming = releases.filter((release) => release.date >= today);
    if (upcoming.length) results.push({ kind, releases: upcoming });
    else failures.push(`${kind}: no date on or after ${today}`);
  };
  for (const kind of ["CPI", "PPI", "NFP"] as const) {
    if (!validSecUserAgent(userAgent)) { failures.push(`${kind}: SEC_USER_AGENT with a contact address is required for bls.gov`); continue; }
    try { requests++; keep(kind, parseBlsSchedule(await http.get(BLS_SCHEDULE_PAGES[kind].url, { headers: { "User-Agent": userAgent! }, maxAttempts: 2 }), kind)); }
    catch (error) { failures.push(`${kind}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  try { requests++; keep("FOMC", parseFomcSchedule(await http.get(FOMC_URL, { maxBytes: 5 * 1024 * 1024 }))); }
  catch (error) { failures.push(`FOMC: ${error instanceof Error ? error.message : String(error)}`); }
  return { results, failures, requests };
}
