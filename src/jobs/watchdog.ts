import pg from "pg";
import { runLoggedJob } from "./job-log";
import { alertNotifierFromEnv } from "../notify/notifier";
import { PgAlertState } from "../ops/alert-state";
import { deliver, evaluate, readCertificate, readDatabase } from "../ops/watchdog";

/** Weekday and noon check. Sends one alert per problem per 23 hours. Needs DATABASE_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const notifier = alertNotifierFromEnv();
  if (!notifier) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID are required");
  const now = new Date();
  const hosts = (process.env.WATCHDOG_TLS_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5_000 });
  try {
    const [data, certs] = await Promise.all([readDatabase(pool), Promise.all(hosts.map((h) => readCertificate(h)))]);
    const findings = evaluate({ ...data, now, volumeBytes: Number(process.env.PG_PVC_BYTES ?? 0), certs });
    const result = await deliver(findings, notifier, new PgAlertState(pool), now);
    if (result.failures) process.exitCode = 1;
    return { ...result };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])watchdog\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("watchdog", main);
