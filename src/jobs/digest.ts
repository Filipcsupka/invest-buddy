import { runLoggedJob } from "./job-log";
import type { AlertChange } from "../db/types";
import pg from "pg";
import { MemoryScoreRepository } from "../db/memory";
import { PostgresScoreRepository } from "../db/postgres";
import { isIsoDate } from "../db/iso-date";

export type DigestLocale = "en" | "sk";
export interface MailMessage { to: string; subject: string; text: string }
export interface Mailer { send(message: MailMessage): Promise<void> }

export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
}

export function buildDigest(to: string, asOf: string, alerts: AlertChange[], locale: DigestLocale): MailMessage {
  const sorted = [...alerts].sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (locale === "sk") return {
    to,
    subject: `Denný prehľad pravidiel ${asOf}`,
    text: [
      `Zmeny stavov pravidiel k ${asOf}:`,
      sorted.length ? sorted.map((alert) => `${alert.ticker}: ${alert.previousState} → ${alert.currentState} (${alert.previousScore} → ${alert.currentScore} bodov).`).join("\n") : "Dnes sa stav pravidiel nezmenil.",
      "Tento prehľad je len informačný skríning podľa zverejnenej metodiky. Nie je to osobné investičné odporúčanie. Úplný záznam upozornení a metodiku nájdete v aplikácii.",
    ].join("\n\n"),
  };
  return {
    to,
    subject: `Daily rule summary ${asOf}`,
    text: [
      `Rule state changes on ${asOf}:`,
      sorted.length ? sorted.map((alert) => `${alert.ticker}: ${alert.previousState} → ${alert.currentState} (${alert.previousScore} → ${alert.currentScore} points).`).join("\n") : "No rule states changed today.",
      "This is an informational screen based on the published methodology. It is not personal investment advice. The full alert log and methodology are available in the app.",
    ].join("\n\n"),
  };
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
  const to = process.env.DIGEST_TO ?? (memory ? "sample@example.invalid" : "");
  if (!to) throw new Error("DIGEST_TO is required");
  const locale: DigestLocale = process.env.DIGEST_LOCALE === "sk" ? "sk" : "en";
  const pool = memory ? null : new pg.Pool({ connectionString: url });
  try {
    const asOf = date ?? (pool ? (await pool.query<{ as_of: string }>("SELECT max(as_of)::text AS as_of FROM ingest_runs")).rows[0]?.as_of : new Date().toISOString().slice(0, 10));
    if (!asOf) throw new Error("No completed daily run");
    const repo = pool ? new PostgresScoreRepository(pool) : new MemoryScoreRepository();
    const alerts = await repo.alerts(asOf);
    await new ConsoleMailer().send(buildDigest(to, asOf, alerts, locale));
    return { alerts: alerts.length, failures: 0 };
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])digest\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("digest", main);
