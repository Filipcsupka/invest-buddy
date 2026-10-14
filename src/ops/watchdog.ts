import tls from "node:tls";
import type pg from "pg";
import { sendAlert, type AlertNotifier } from "../notify/notifier";
import type { AlertStateStore } from "./alert-state";
import { aiCeilingStops, databaseSize, expiringCertificates, missedJobs, staleHealth, type CertResult, type Finding, type LastGoodRuns } from "./watchdog-rules";

export interface WatchdogInput {
  now: Date;
  lastGood: LastGoodRuns;
  health: { lastScoreDate: string | null; lastScanAsOf: string | null };
  dbSizeBytes: number;
  volumeBytes: number;
  certs: CertResult[];
  aiCeiling: { job: string; startedAt: Date }[];
}

export function evaluate(input: WatchdogInput): Finding[] {
  return [
    ...missedJobs(input.now, input.lastGood),
    ...staleHealth(input.now, input.health),
    ...databaseSize(input.dbSizeBytes, input.volumeBytes),
    ...expiringCertificates(input.now, input.certs),
    ...aiCeilingStops(input.aiCeiling),
  ];
}

export interface WatchdogResult { findings: number; sent: number; suppressed: number; failures: number }

/** Sends each finding once per 24 hours. A failed send releases its claim, so the next run tries again. */
export async function deliver(findings: Finding[], notifier: AlertNotifier, state: AlertStateStore, now: Date, log?: (line: string) => void): Promise<WatchdogResult> {
  const result: WatchdogResult = { findings: findings.length, sent: 0, suppressed: 0, failures: 0 };
  for (const finding of findings) {
    const claim = await state.claim(finding.key, finding.subject, now);
    if (!claim.claimed) { result.suppressed += 1; continue; }
    const ok = await sendAlert(notifier, { channel: "telegram", subject: finding.subject, body: finding.body }, log);
    if (ok) result.sent += 1;
    else { result.failures += 1; await state.release(finding.key, claim.previous); }
  }
  return result;
}

/** Reads the certificate expiry through a TLS handshake. Null when the handshake fails. */
export function readCertificate(hostPort: string, timeoutMs = 10_000): Promise<CertResult> {
  const [host, port] = hostPort.split(":");
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: Number(port) || 443, servername: host, timeout: timeoutMs }, () => {
      const to = socket.getPeerCertificate().valid_to;
      socket.end();
      resolve({ host: hostPort, validTo: to ? new Date(to) : null });
    });
    socket.on("error", () => resolve({ host: hostPort, validTo: null }));
    socket.on("timeout", () => { socket.destroy(); resolve({ host: hostPort, validTo: null }); });
  });
}

/** Reads what the rules need from Postgres. The health dates use the same queries as /api/health. */
export async function readDatabase(pool: Pick<pg.Pool, "query">, now: Date) {
  const good = await pool.query<{ job: string; last: Date }>("SELECT job, max(started_at) AS last FROM job_runs WHERE status IN ('ok', 'partial') GROUP BY job");
  const health = await pool.query<{ scan: string | null; score: string | null }>("SELECT (SELECT max(as_of)::text FROM scan_runs) scan, (SELECT max(as_of)::text FROM score_results) score");
  const size = await pool.query<{ bytes: string }>("SELECT pg_database_size(current_database())::text AS bytes");
  const ceiling = await pool.query<{ job: string; started_at: Date }>("SELECT DISTINCT ON (job) job, started_at FROM job_runs WHERE started_at > $1::timestamptz - interval '24 hours' AND counts->>'exitCode' = '5' ORDER BY job, started_at DESC", [now]);
  return {
    lastGood: new Map(good.rows.map((r) => [r.job, r.last])) as LastGoodRuns,
    health: { lastScoreDate: health.rows[0].score, lastScanAsOf: health.rows[0].scan },
    dbSizeBytes: Number(size.rows[0].bytes),
    aiCeiling: ceiling.rows.map((r) => ({ job: r.job, startedAt: r.started_at })),
  };
}
