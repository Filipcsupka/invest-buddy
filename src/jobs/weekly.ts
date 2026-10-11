import pg from "pg";
import { runLoggedJob } from "./job-log";
import { isIsoDate } from "../db/iso-date";
import { PostgresDeliveryLog, type DeliveryLog } from "../db/notifications";
import { telegramFromEnv, type Notifier } from "../notify/telegram";
import { formatWeekly, isoWeekMonday, type WeeklyRow } from "../notify/weekly";
import type { AlertLocale, StateName } from "../notify/format";
import { flags } from "../config/flags";

const siteUrl = process.env.SITE_URL ?? "https://invest.filipcsupka.online";

export interface WeeklyResult { sent: number; duplicates: number }

/** Latest score per ticker and the latest score at least 7 days before it. */
export async function loadWeeklyRows(pool: Pick<pg.Pool, "query">, asOf: string): Promise<WeeklyRow[]> {
  const result = await pool.query<{ ticker: string; state: StateName; total: number | null; prev_state: StateName | null; prev_total: number | null }>(
    `SELECT cur.ticker, cur.state, cur.total, prev.state AS prev_state, prev.total AS prev_total
       FROM (SELECT DISTINCT ON (ticker) ticker, state, total FROM score_results WHERE as_of <= $1::date ORDER BY ticker, as_of DESC) cur
       LEFT JOIN (SELECT DISTINCT ON (ticker) ticker, state, total FROM score_results WHERE as_of <= $1::date - 7 ORDER BY ticker, as_of DESC) prev USING (ticker)
      ORDER BY cur.ticker`, [asOf]);
  return result.rows.map((row) => ({ ticker: row.ticker, state: row.state, points: row.total, previous: row.prev_state ? { state: row.prev_state, points: row.prev_total } : null }));
}

/**
 * Posts one weekly message. The delivery key is the Monday of the ISO week of asOf plus the language, claimed before
 * sending and released when the send fails, so a rerun in the same week never double-posts and a failed send is retried.
 */
export async function deliverWeekly(input: { asOf: string; rows: WeeklyRow[]; locale: AlertLocale; notifier: Notifier; log: DeliveryLog; target: string; adviceOutput?: boolean; site?: string }): Promise<WeeklyResult> {
  const key = { channel: "telegram" as const, target: input.target, asOf: isoWeekMonday(input.asOf), kind: `weekly:${input.locale}` };
  if (!(await input.log.claim(key, input.rows.length))) return { sent: 0, duplicates: 1 };
  try {
    await input.notifier.send(formatWeekly({ rows: input.rows, locale: input.locale, asOf: input.asOf, adviceOutput: input.adviceOutput ?? flags().ADVICE_OUTPUT, site: input.site ?? siteUrl }));
  } catch (error) {
    await input.log.release(key);
    throw error;
  }
  return { sent: 1, duplicates: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const dateIndex = args.indexOf("--date");
  const date = dateIndex >= 0 ? args[dateIndex + 1] : undefined;
  if (dateIndex >= 0 && !isIsoDate(date ?? "")) throw new Error("--date requires YYYY-MM-DD");
  if (args.some((arg, index) => arg !== "--date" && index !== dateIndex + 1)) throw new Error("Usage: weekly [--date YYYY-MM-DD]");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const telegram = telegramFromEnv();
  if (!telegram) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  const locale: AlertLocale = process.env.DIGEST_LOCALE === "sk" ? "sk" : "en";
  const pool = new pg.Pool({ connectionString: url });
  try {
    const asOf = date ?? (await pool.query<{ as_of: string }>("SELECT max(as_of)::text AS as_of FROM score_results")).rows[0]?.as_of;
    if (!asOf) throw new Error("No scores yet");
    const rows = await loadWeeklyRows(pool, asOf);
    const result = await deliverWeekly({ asOf, rows, locale, notifier: telegram, log: new PostgresDeliveryLog(pool), target: process.env.TELEGRAM_CHAT_ID!.trim() });
    return { tickers: rows.length, telegram: result.sent ? "sent" : "duplicate", sent: result.sent, duplicates: result.duplicates, failures: 0 };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])weekly\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("weekly", main);
