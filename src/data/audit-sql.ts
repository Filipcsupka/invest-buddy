/** Sessions the company chart needs: 100 plotted plus a full MA200 window. */
export const AUDIT_BAR_LIMIT = 320;

/**
 * SQL for `score_results.audit` with `inputs.bars` cut to the last `keep` sessions.
 * Stored audits can hold years of daily bars per ticker; web reads load many rows per request, so the cut happens in Postgres.
 */
export function trimmedAudit(column = "s.audit", keep = AUDIT_BAR_LIMIT): string {
  const bars = `${column}->'inputs'->'bars'`;
  const kept = keep > 0
    ? `COALESCE((SELECT jsonb_agg(e.b ORDER BY e.o) FROM jsonb_array_elements(${bars}) WITH ORDINALITY e(b,o) WHERE e.o > jsonb_array_length(${bars}) - ${Math.trunc(keep)}),'[]'::jsonb)`
    : `'[]'::jsonb`;
  return `CASE WHEN jsonb_typeof(${bars})='array' AND jsonb_array_length(${bars}) > ${Math.max(0, Math.trunc(keep))} THEN jsonb_set(${column},'{inputs,bars}',${kept}) ELSE ${column} END`;
}
