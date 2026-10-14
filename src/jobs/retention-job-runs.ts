type Client = { query: (sql: string) => Promise<{ rows: { count: number }[]; rowCount: number | null }> };

/** job_runs rows older than this are deleted by retention. */
export const JOB_RUNS_KEEP_DAYS = 400;
export const expiredJobRuns = `FROM job_runs WHERE started_at < now() - interval '${JOB_RUNS_KEEP_DAYS} days'`;

/** Deletes job_runs rows older than 400 days. Runs inside the caller's transaction; a dry run only counts. */
export async function purgeJobRuns(client: Client, dryRun: boolean): Promise<number> {
  if (dryRun) return (await client.query(`SELECT count(*)::int AS count ${expiredJobRuns}`)).rows[0].count;
  return (await client.query(`DELETE ${expiredJobRuns}`)).rowCount ?? 0;
}
