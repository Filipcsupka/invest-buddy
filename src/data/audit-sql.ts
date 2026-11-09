/** Sessions the company chart needs: 100 plotted plus a full MA200 window. */
export const AUDIT_BAR_LIMIT = 320;

/**
 * SQL for `score_results.audit` with `inputs.bars` cut to the last `keep` sessions.
 * Stored audits can hold years of daily bars per ticker; web reads load many rows per request, so the cut happens in Postgres.
 * The bars array is extracted and measured once per row (OFFSET 0 stops the planner from inlining it): re-reading it per element is quadratic on large audits.
 */
export function trimmedAudit(column = "s.audit", keep = AUDIT_BAR_LIMIT): string {
  const limit = Math.max(0, Math.trunc(keep));
  if (limit === 0) return `jsonb_set(${column},'{inputs,bars}','[]'::jsonb,false)`;
  const kept = limit > 0
    ? `COALESCE((SELECT jsonb_agg(e.b ORDER BY e.o) FROM jsonb_array_elements(t.bars) WITH ORDINALITY e(b,o) WHERE e.o > t.n - ${limit}),'[]'::jsonb)`
    : `'[]'::jsonb`;
  return `(SELECT CASE WHEN t.n > ${limit} THEN jsonb_set(t.audit,'{inputs,bars}',${kept}) ELSE t.audit END
    FROM (SELECT b.audit,b.bars,CASE WHEN jsonb_typeof(b.bars)='array' THEN jsonb_array_length(b.bars) ELSE 0 END AS n
      FROM (SELECT ${column} AS audit,${column}->'inputs'->'bars' AS bars OFFSET 0) b OFFSET 0) t)`;
}
