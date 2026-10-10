import { runLoggedJob } from "./job-log";
import type { AlertChange } from "../db/types";
import pg from "pg";
import { MemoryScoreRepository } from "../db/memory";
import { PostgresScoreRepository } from "../db/postgres";
import { isIsoDate } from "../db/iso-date";
import { PostgresDeliveryLog, type DeliveryLog } from "../db/notifications";
import { telegramFromEnv, type Notifier } from "../notify/telegram";
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

/** Telegram post: the digest text plus a link to the dashboard in the same language. */
export function telegramDigest(asOf: string, alerts: AlertChange[], locale: DigestLocale, site = siteUrl): string {
  const message = buildDigest("", asOf, alerts, locale);
  return [message.subject, message.text, `${site}/${locale}/dashboard`].join("\n\n");
}

export type TelegramOutcome = "sent" | "duplicate" | "empty";

/**
 * Posts one digest per day to the configured chat. A day with no state changes is skipped unless postEmpty is set.
 * The delivery is claimed before sending and released when the send fails, so a rerun never posts the same day twice
 * and a failed day is retried by the next run.
 */
export async function deliverTelegram(input: { asOf: string; alerts: AlertChange[]; locale: DigestLocale; notifier: Notifier; log: DeliveryLog; target: string; postEmpty?: boolean }): Promise<TelegramOutcome> {
  if (!input.alerts.length && !input.postEmpty) return "empty";
  const key = { channel: "telegram" as const, target: input.target, asOf: input.asOf, kind: `digest:${input.locale}` };
  if (!(await input.log.claim(key, input.alerts.length))) return "duplicate";
  try {
    await input.notifier.send(telegramDigest(input.asOf, input.alerts, input.locale));
  } catch (error) {
    await input.log.release(key);
    throw error;
  }
  return "sent";
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
      return { alerts: alerts.length, telegram: telegramResult, failures: 0 };
    }
    await new ConsoleMailer().send(buildDigest(to, asOf, alerts, locale));
    return { alerts: alerts.length, failures: 0 };
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])digest\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("digest", main);
