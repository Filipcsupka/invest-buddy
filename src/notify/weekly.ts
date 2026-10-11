/** Telegram HTML weekly summary: counts per band, green and blue tickers, movers since last week. EN and SK. */
import { ALERT_TEXT, BAND_EMOJI, bandLabel, bandOf, escapeHtml, sliderPosition, type AlertLocale, type Band, type StateName } from "./format";

export interface WeeklyRow {
  ticker: string;
  state: StateName;
  points: number | null;
  /** State and points one week earlier. Null when the ticker had no rating then. */
  previous: { state: StateName; points: number | null } | null;
}

export interface WeeklyInput {
  rows: WeeklyRow[];
  locale: AlertLocale;
  /** Date of the latest scores. */
  asOf: string;
  adviceOutput: boolean;
  site: string;
}

interface Text {
  title: (week: string, asOf: string) => string;
  counts: string;
  up: string;
  down: string;
  none: string;
  dashboard: string;
  empty: string;
}

export const WEEKLY_TEXT: Record<AlertLocale, Text> = {
  en: {
    title: (week, asOf) => `Weekly summary · week ${week} (scores of ${asOf})`,
    counts: "Tickers per status",
    up: "Moved up",
    down: "Moved down",
    none: "none",
    dashboard: "Dashboard",
    empty: "No scores yet.",
  },
  sk: {
    title: (week, asOf) => `Týždenný prehľad · týždeň ${week} (skóre z ${asOf})`,
    counts: "Počet tickerov podľa stavu",
    up: "Posun nahor",
    down: "Posun nadol",
    none: "žiadne",
    dashboard: "Dashboard",
    empty: "Zatiaľ bez skóre.",
  },
};

const BAND_ORDER: Band[] = ["green", "blue", "yellow", "orange", "red", "gray"];
const PER_LINE = 6;

/** ISO 8601 week of a YYYY-MM-DD date, as "2026-W41". */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of the ISO week of a YYYY-MM-DD date. Used as the delivery key date, so there is one key per ISO week. */
export function isoWeekMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.toISOString().slice(0, 10);
}

function companyLink(site: string, locale: AlertLocale, ticker: string): string {
  return `<a href="${escapeHtml(`${site}/${locale}/company/${encodeURIComponent(ticker)}`)}">${escapeHtml(ticker)}</a>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Position of a state on the slider, or null for not-enough-data. */
function position(state: StateName): number | null { return sliderPosition(bandOf(state)); }

export function weeklyMovers(rows: WeeklyRow[]): { up: WeeklyRow[]; down: WeeklyRow[] } {
  const up: WeeklyRow[] = [];
  const down: WeeklyRow[] = [];
  for (const row of rows) {
    if (!row.previous) continue;
    const before = position(row.previous.state);
    const now = position(row.state);
    if (before === null || now === null || before === now) continue;
    (now > before ? up : down).push(row);
  }
  return { up, down };
}

export function formatWeekly(input: WeeklyInput): string {
  const { locale, adviceOutput } = input;
  const text = WEEKLY_TEXT[locale];
  const site = input.site.replace(/\/+$/, "");
  const rows = [...input.rows].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const lines: string[] = [`📊 <b>${escapeHtml(text.title(isoWeek(input.asOf), input.asOf))}</b>`];
  if (!rows.length) lines.push(escapeHtml(text.empty));
  else {
    lines.push("", `<b>${escapeHtml(text.counts)}</b>`);
    for (const band of BAND_ORDER) {
      const count = rows.filter((row) => bandOf(row.state) === band).length;
      lines.push(`${BAND_EMOJI[band]} ${escapeHtml(bandLabel(locale, band, adviceOutput))}: ${count}`);
    }
    for (const band of ["green", "blue"] as const) {
      const tickers = rows.filter((row) => bandOf(row.state) === band);
      lines.push("", `${BAND_EMOJI[band]} <b>${escapeHtml(bandLabel(locale, band, adviceOutput))}</b>`);
      if (!tickers.length) lines.push(escapeHtml(text.none));
      for (const group of chunk(tickers, PER_LINE)) lines.push(group.map((row) => `${companyLink(site, locale, row.ticker)} (${row.points ?? escapeHtml(ALERT_TEXT[locale].noData)})`).join(" · "));
    }
    const { up, down } = weeklyMovers(rows);
    for (const [title, list, arrow] of [[text.up, up, "⬆️"], [text.down, down, "⬇️"]] as const) {
      lines.push("", `${arrow} <b>${escapeHtml(title)}</b>`);
      if (!list.length) lines.push(escapeHtml(text.none));
      for (const row of list) lines.push(`${companyLink(site, locale, row.ticker)} ${BAND_EMOJI[bandOf(row.previous!.state)]} → ${BAND_EMOJI[bandOf(row.state)]}`);
    }
  }
  lines.push("", `<a href="${escapeHtml(`${site}/${locale}/dashboard`)}">${escapeHtml(text.dashboard)}</a> · <a href="${escapeHtml(`${site}/${locale}/methodology`)}">${escapeHtml(ALERT_TEXT[locale].methodology)}</a>`);
  lines.push(escapeHtml(ALERT_TEXT[locale].disclaimer));
  return lines.join("\n");
}
