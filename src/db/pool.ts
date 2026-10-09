import pg from "pg";

let shared: pg.Pool | null = null;
let shuttingDown = false;

/** Closes the shared pool. Safe to call twice. */
export async function closePool(): Promise<void> {
  const pool = shared;
  shared = null;
  if (!pool) return;
  try { await pool.end(); } catch { /* already closed */ }
}

async function onSigterm() {
  if (shuttingDown) return;
  shuttingDown = true;
  await closePool();
  // Registering a SIGTERM listener removes Node's default exit. Exit here only when nothing else handles the signal.
  if (process.listenerCount("SIGTERM") === 0) process.exit(0);
  shuttingDown = false;
}

/**
 * One lazy pool per server process for web reads. Null without DATABASE_URL.
 * Callers must not call `end()` on it. Jobs under `src/jobs` keep their own pools.
 */
export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!shared) {
    shared = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 3000 });
    // An idle client error must not crash the process; the pool drops the client and reconnects on the next query.
    shared.on("error", () => undefined);
    process.once("SIGTERM", () => { void onSigterm(); });
  }
  return shared;
}
