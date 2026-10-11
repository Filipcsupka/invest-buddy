import { runLoggedJob } from "./job-log";
import type { AlertChange } from "../db/types";
import pg from "pg";
import { MemoryScoreRepository } from "../db/memory";
import { PostgresScoreRepository } from "../db/postgres";
import { isIsoDate } from "../db/iso-date";
import { PostgresDeliveryLog, type DeliveryLog } from "../db/notifications";
import { telegramFromEnv, type Notifier } from "../notify/telegram";
import { bandOf, escapeHtml, formatEventAlert, type ConfirmationKey, type Coverage } from "../notify/format";
import { flags } from "../config/flags";
import { getMessages } from "../i18n";
import { stateKey } from "../i18n/score-text";

export type DigestLocale = "en" | "sk";
export interface MailMessage { to: string; subject: string; text: string }
export interface Mailer { send(message: MailMessage): Promise<void> }

export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
}

function stateLabel(locale: DigestLocale, state: AlertChange["currentState"]): string {
  return getMessages(locale).states[stateKey(state)] ?? state;
}

export function buildDigest(to: string, asOf: string, alerts: AlertChange[], locale: DigestLocale): MailMessage {
  const sorted = [...alerts].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((alert) => ({ ...alert, previousState: alert.previousState === null ? null : stateLabel(locale, alert.previousState), currentState: stateLabel(locale, alert.currentState) }));
  if (locale === "sk") return {
    to,
    subject: `Denný prehľad pravidiel ${asOf}`,
    text: [
      `Zmeny stavov pravidiel k ${asOf}:`,
      sorted.length ? sorted.map((alert) => alert.previousState === null ? `${alert.ticker}: nové hodnotenie ${alert.currentState} (${alert.currentScore} bodov).` : `${alert.ticker}: ${alert.previousState} → ${alert.currentState} (${alert.previousScore} → ${alert.currentScore} bodov).`).join("\n") : "Dnes sa stav pravidiel nezmenil.",
      "Tento prehľad je len informačný skríning podľa zverejnenej metodiky. Nie je to osobné investičné odporúčanie. Úplný záznam upozornení a metodiku nájdete v aplikácii.",
    ].join("\n\n"),
  };
  return {
    to,
    subject: `Daily rule summary ${asOf}`,
    text: [
      `Rule state changes on ${asOf}:`,
      sorted.length ? sorted.map((alert) => alert.previousState === null ? `${alert.ticker}: first rating ${alert.currentState} (${alert.currentScore} points).` : `${alert.ticker}: ${alert.previousState} → ${alert.currentState} (${alert.previousScore} → ${alert.currentScore} points).`).join("\n") : "No rule states changed today.",
      "This is an informational screen based on the published methodology. It is not personal investment advice. The full alert log and methodology are available in the app.",
    ].join("\n\n"),
  };
}

const siteUrl = process.env.SITE_URL ?? "https://invest.filipcsupka.online";

/** Telegram HTML for an empty day: the digest text, escaped, plus a link to the dashboard in the same language. */
export function telegramDigest(asOf: string, alerts: AlertChange[], locale: DigestLocale, site = siteUrl): string {
  const message = buildDigest("", asOf, alerts, locale);
  return [message.subject, message.text, `${site}/${locale}/dashboard`].map(escapeHtml).join("\n\n");
}

export interface TelegramResult { sent: number; duplicates: number; empty: boolean }

/** Alerts whose band changed, first ratings included, sorted by ticker. */
export function bandChanges(alerts: AlertChange[]): AlertChange[] {
  return alerts.filter((alert) => alert.previousState === null || bandOf(alert.previousState) !== bandOf(alert.currentState)).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/**
 * Posts one HTML message per ticker that changed band. Each ticker is claimed per day and language before sending and
 * released when the send fails, so a rerun never posts the same ticker twice and a failed ticker is retried by the next run.
 * One failed ticker does not stop the others; the first error is thrown after all were tried.
 * A day with no band change posts the plain list only when postEmpty is set.
 */
export async function deliverTelegram(input: { asOf: string; alerts: AlertChange[]; locale: DigestLocale; notifier: Notifier; log: DeliveryLog; target: string; postEmpty?: boolean; adviceOutput?: boolean; site?: string; extras?: Record<string, { confirmations?: ConfirmationKey[]; coverage?: Coverage }> }): Promise<TelegramResult> {
  const changes = bandChanges(input.alerts);
  const site = input.site ?? siteUrl;
  const adviceOutput = input.adviceOutput ?? flags().ADVICE_OUTPUT;
  const result: TelegramResult = { sent: 0, duplicates: 0, empty: false };
  let failure: unknown;
  const post = async (kind: string, count: number, text: string) => {
    const key = { channel: "telegram" as const, target: input.target, asOf: input.asOf, kind };
    if (!(await input.log.claim(key, count))) { result.duplicates++; return; }
    try { await input.notifier.send(text); result.sent++; } catch (error) { await input.log.release(key); failure ??= error; }
  };
  if (!changes.length) {
    if (!input.postEmpty) return { ...result, empty: true };
    await post(`digest:${input.locale}`, 0, telegramDigest(input.asOf, [], input.locale, site));
  }
  for (const alert of changes) {
    const extra = input.extras?.[alert.ticker];
    const text = formatEventAlert({ ticker: alert.ticker, locale: input.locale, adviceOutput, site, confirmations: extra?.confirmations, coverage: extra?.coverage,
      previous: alert.previousState === null ? null : { state: alert.previousState, points: alert.previousScore }, current: { state: alert.currentState, points: alert.currentScore } });
    await post(`alert:${input.locale}:${alert.ticker}`, 1, text);
  }
  if (failure) throw failure;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const memory = args.includes("--memory");
  const dateIndex = args.indexOf("--date");
  const date = dateIndex >= 0 ? args[dateIndex + 1] : undefined;
  if (dateIndex >= 0 && !isIsoDate(date ?? "")) throw new Error("--date requires YYYY-MM-DD");
  if (args.some((arg, index) => arg !== "--memory" && arg !== "--date" && index !== dateIndex + 1)) throw new Error("Usage: digest [--date YYYY-MM-DD] [--memory]");
  const url = process.env.DATABASE_URL;
  if (!memory && !url) throw new Error("DATABASE_URL is required; use --memory for a fixture-only run");
  const telegram = memory ? null : telegramFromEnv();
  const to = process.env.DIGEST_TO ?? (memory ? "sample@example.invalid" : "");
  if (!telegram && !to) throw new Error("DIGEST_TO or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  const locale: DigestLocale = process.env.DIGEST_LOCALE === "sk" ? "sk" : "en";
  const pool = memory ? null : new pg.Pool({ connectionString: url });
  try {
    const asOf = date ?? (pool ? (await pool.query<{ as_of: string }>("SELECT max(as_of)::text AS as_of FROM ingest_runs")).rows[0]?.as_of : new Date().toISOString().slice(0, 10));
    if (!asOf) throw new Error("No completed daily run");
    const repo = pool ? new PostgresScoreRepository(pool) : new MemoryScoreRepository();
    const alerts = await repo.alerts(asOf);
    if (telegram && pool) {
      const telegramResult = await deliverTelegram({ asOf, alerts, locale, notifier: telegram, log: new PostgresDeliveryLog(pool), target: process.env.TELEGRAM_CHAT_ID!.trim(), postEmpty: process.env.TELEGRAM_POST_EMPTY === "on" });
      return { alerts: alerts.length, telegram: telegramResult.empty ? "empty" : telegramResult.sent ? "sent" : "duplicate", sent: telegramResult.sent, duplicates: telegramResult.duplicates, failures: 0 };
    }
    await new ConsoleMailer().send(buildDigest(to, asOf, alerts, locale));
    return { alerts: alerts.length, failures: 0 };
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])digest\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("digest", main);
