type Client = { query: (sql: string) => Promise<{ rows: { count: number }[]; rowCount: number | null }> };

export const expiredTradeIdeas = "FROM trade_ideas WHERE expires_at < now()";
export const expiredJudgeRuns = "FROM judge_runs WHERE expires_at < now()";

/**
 * Deletes expired trade ideas (90 days) and judge runs (30 days). Runs inside the caller's transaction; a dry run only counts.
 * Hook in retention.ts, next to purgeExtractionRuns:
 *   const ideas = await purgeIdeas(client, dryRun);
 */
export async function purgeIdeas(client: Client, dryRun: boolean): Promise<{ tradeIdeas: number; judgeRuns: number }> {
  if (dryRun) {
    return {
      tradeIdeas: (await client.query(`SELECT count(*)::int AS count ${expiredTradeIdeas}`)).rows[0].count,
      judgeRuns: (await client.query(`SELECT count(*)::int AS count ${expiredJudgeRuns}`)).rows[0].count,
    };
  }
  return {
    tradeIdeas: (await client.query(`DELETE ${expiredTradeIdeas}`)).rowCount ?? 0,
    judgeRuns: (await client.query(`DELETE ${expiredJudgeRuns}`)).rowCount ?? 0,
  };
}
