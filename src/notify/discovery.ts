/** Telegram HTML post for the weekly discovery job (DS1): one message per week and language listing the stored candidates. EN and SK. */
import type pg from "pg";
import type { DeliveryLog } from "../db/notifications";
import type { Notifier } from "./telegram";
import { ALERT_TEXT, BAND_EMOJI, MAX_POINTS, bandLabel, bandOf, escapeHtml, type AlertLocale, type StateName } from "./format";

export interface DiscoveryRow {
  symbol: string;
  name: string;
  ruleScore: number;
  /** Stored rule state name, as written by the scoring engine. */
  ruleState: string;
  sources: { kind: string; url: string; detail: string; growth?: { current: number; prior: number } }[];
}

export interface DiscoveryPostInput {
  week: string;
  rows: DiscoveryRow[];
  locale: AlertLocale;
  adviceOutput: boolean;
  site: string;
}

interface Text {
  title: (week: string) => string;
  intro: string;
  surfaced: string;
  rule: string;
  growth: (current: string, prior: string) => string;
  kinds: Record<string, string>;
  other: string;
  methodology: string;
  empty: string;
}

export const DISCOVERY_TEXT: Record<AlertLocale, Text> = {
  en: {
    title: (week) => `New candidates · week of ${week}`,
    intro: "Names outside the tracked universe that passed this week's screen. They are listed for review and are not scored daily yet.",
    surfaced: "Why it surfaced",
    rule: "Rule score",
    growth: (current, prior) => `Revenue growth ${current}% year over year (previous quarter ${prior}%)`,
    kinds: { edgar: "SEC 8-K", price_volume: "Price and volume move", theme: "Theme", frames: "Revenue growth, SEC data", clinical_trial: "Clinical trial update", ownership: "Ownership filing (13D/13G)", thirteenf: "13F holding" },
    other: "Source",
    methodology: "Methodology",
    empty: "No candidates this week.",
  },
  sk: {
    title: (week) => `Noví kandidáti · týždeň od ${week}`,
    intro: "Firmy mimo sledovaného univerza, ktoré prešli týždenným výberom. Sú len na posúdenie a zatiaľ sa denne neskórujú.",
    surfaced: "Prečo sa objavila",
    rule: "Skóre pravidiel",
    growth: (current, prior) => `Rast tržieb ${current} % medziročne (predchádzajúci štvrťrok ${prior} %)`,
    kinds: { edgar: "SEC 8-K", price_volume: "Pohyb ceny a objemu", theme: "Téma", frames: "Rast tržieb, údaje SEC", clinical_trial: "Aktualizácia klinickej štúdie", ownership: "Oznámenie o vlastníctve (13D/13G)", thirteenf: "Držba z 13F" },
    other: "Zdroj",
    methodology: "Metodika",
    empty: "Tento týždeň bez kandidátov.",
  },
};

/** Kinds whose stored detail is a short fact worth showing next to the link. The other details are fixed English phrases. */
const SHOW_DETAIL = new Set(["edgar", "theme", "clinical_trial"]);
const MAX_SOURCES = 3;

const percent = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/** A filing link when a source has one, else the SEC company search for the ticker. */
export function tickerLink(row: Pick<DiscoveryRow, "symbol" | "sources">): string {
  const filing = row.sources.find((source) => /^https:\/\/www\.sec\.gov\/(?:Archives|cgi-bin)\//.test(source.url));
  return filing?.url ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(row.symbol)}&type=&dateb=&owner=include&count=40`;
}

function stateText(locale: AlertLocale, state: string, adviceOutput: boolean): string {
  const known = ["Setup met (>=18)", "Watch", "Wait", "Ignore", "Criteria broken", "Insufficient/invalid data"].includes(state);
  if (!known) return escapeHtml(state);
  const band = bandOf(state as StateName);
  return `${BAND_EMOJI[band]} ${escapeHtml(bandLabel(locale, band, adviceOutput))}`;
}

export function formatNewCandidates(input: DiscoveryPostInput): string {
  const { locale, adviceOutput } = input;
  const text = DISCOVERY_TEXT[locale];
  const site = input.site.replace(/\/+$/, "");
  const lines: string[] = [`🔎 <b>${escapeHtml(text.title(input.week))}</b>`];
  if (!input.rows.length) lines.push(escapeHtml(text.empty));
  else {
    lines.push(escapeHtml(text.intro));
    for (const row of [...input.rows].sort((a, b) => b.ruleScore - a.ruleScore || a.symbol.localeCompare(b.symbol))) {
      lines.push("", `<a href="${escapeHtml(tickerLink(row))}"><b>${escapeHtml(row.symbol)}</b></a> · ${escapeHtml(row.name)}`);
      lines.push(`${escapeHtml(text.rule)}: ${row.ruleScore} / ${MAX_POINTS} · ${stateText(locale, row.ruleState, adviceOutput)}`);
      const growth = row.sources.find((source) => source.growth)?.growth;
      if (growth) lines.push(escapeHtml(text.growth(percent(growth.current), percent(growth.prior))));
      const seen = new Set<string>();
      const why: string[] = [];
      for (const source of row.sources) {
        const key = `${source.kind}|${source.detail}`;
        if (seen.has(key) || why.length >= MAX_SOURCES) continue;
        seen.add(key);
        const label = escapeHtml(text.kinds[source.kind] ?? text.other);
        const link = /^https:\/\//.test(source.url) ? `<a href="${escapeHtml(source.url)}">${label}</a>` : label;
        why.push(`• ${link}${SHOW_DETAIL.has(source.kind) && source.detail ? `: ${escapeHtml(source.detail)}` : ""}`);
      }
      if (why.length) lines.push(`${escapeHtml(text.surfaced)}:`, ...why);
    }
  }
  lines.push("", `<a href="${escapeHtml(`${site}/${locale}/methodology`)}">${escapeHtml(text.methodology)}</a>`);
  lines.push(escapeHtml(ALERT_TEXT[locale].disclaimer));
  return lines.join("\n");
}

/** The week's stored candidates, best rule score first. Rejected rows are left out. */
export async function loadWeekCandidates(db: Pick<pg.Pool, "query">, week: string): Promise<DiscoveryRow[]> {
  const result = await db.query<{ symbol: string; name: string; rule_score: number; rule_state: string; sources: DiscoveryRow["sources"] }>(
    "SELECT symbol,name,rule_score,rule_state,sources FROM discovery_candidates WHERE week_start=$1::date AND status <> 'rejected' ORDER BY rule_score DESC, symbol", [week]);
  return result.rows.map((row) => ({ symbol: row.symbol, name: row.name, ruleScore: Number(row.rule_score), ruleState: row.rule_state, sources: Array.isArray(row.sources) ? row.sources : [] }));
}

/**
 * Posts the week's message once. The delivery is claimed per channel, chat, week and language before sending and released when the send fails,
 * so a rerun never posts twice and a failed post is retried by the next run. An empty week posts nothing.
 */
export async function deliverNewCandidates(input: DiscoveryPostInput & { notifier: Notifier; log: DeliveryLog; target: string }): Promise<{ sent: number; duplicates: number }> {
  if (!input.rows.length) return { sent: 0, duplicates: 0 };
  const key = { channel: "telegram" as const, target: input.target, asOf: input.week, kind: `discovery:${input.locale}` };
  if (!(await input.log.claim(key, input.rows.length))) return { sent: 0, duplicates: 1 };
  try { await input.notifier.send(formatNewCandidates(input)); } catch (error) { await input.log.release(key); throw error; }
  return { sent: 1, duplicates: 0 };
}
