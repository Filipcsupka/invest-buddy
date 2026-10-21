import type pg from "pg";
import { FUNDAMENTALS_CONCEPTS } from "../../data/fundamentals-concepts";
import { putSnapshot } from "../../data/raw-store";
import type { SourceHttp } from "./client";

export const companyfactsUrl = (cik: number) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;
type Fact = { start?: string; end?: string; val?: number; accn?: string; fy?: number; fp?: string; form?: string; filed?: string; frame?: string };
type Response = { cik?: number; facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> };
export interface FundamentalRow {
  ticker: string; taxonomy: string; concept: string; unit: string; periodStart: string | null; periodEnd: string;
  fy: number | null; fp: string | null; form: string; filed: string; accession: string; value: number; frame: string | null;
}
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
export function parseCompanyfacts(body: string, ticker: string): FundamentalRow[] {
  const data = JSON.parse(body) as Response;
  if (!data.facts || typeof data.facts !== "object") throw new Error("SEC companyfacts response has no facts");
  const rows: FundamentalRow[] = [];
  for (const [taxonomy, concepts] of Object.entries(data.facts)) {
    const allowed = FUNDAMENTALS_CONCEPTS[taxonomy as keyof typeof FUNDAMENTALS_CONCEPTS];
    if (!allowed) continue;
    for (const [concept, entry] of Object.entries(concepts)) {
      if (!allowed.has(concept)) continue;
      for (const [unit, facts] of Object.entries(entry.units ?? {})) for (const fact of facts) {
        if (!date(fact.end) || !date(fact.filed) || !fact.accn || !fact.form || typeof fact.val !== "number" || !Number.isFinite(fact.val)) continue;
        if (fact.start != null && !date(fact.start)) continue;
        rows.push({ ticker, taxonomy, concept, unit, periodStart: fact.start ?? null, periodEnd: fact.end,
          fy: Number.isInteger(fact.fy) ? fact.fy! : null, fp: fact.fp ?? null, form: fact.form,
          filed: fact.filed, accession: fact.accn, value: fact.val, frame: fact.frame ?? null });
      }
    }
  }
  return rows;
}

export async function insertFundamentals(db: Pick<pg.Pool, "query">, rows: FundamentalRow[], sourceId = "sec"): Promise<number> {
  let inserted = 0;
  // Bounded batches avoid a giant parameter list for issuers with long histories.
  for (let offset = 0; offset < rows.length; offset += 500) {
    const result = await db.query<{ id: string }>(`INSERT INTO fundamentals_pit
      (ticker,taxonomy,concept,unit,period_start,period_end,fy,fp,form,filed,accession,value,frame,source_id)
      SELECT x.ticker,x.taxonomy,x.concept,x.unit,x."periodStart"::date,x."periodEnd"::date,x.fy,x.fp,x.form,x.filed::date,x.accession,x.value,x.frame,$2
      FROM jsonb_to_recordset($1::jsonb) AS x(ticker text,taxonomy text,concept text,unit text,"periodStart" text,"periodEnd" text,fy integer,fp text,form text,filed text,accession text,value numeric,frame text)
      ON CONFLICT (ticker,taxonomy,concept,unit,period_start,period_end,accession) DO NOTHING RETURNING id`, [JSON.stringify(rows.slice(offset, offset + 500)), sourceId]);
    inserted += result.rowCount ?? result.rows.length;
  }
  return inserted;
}

export async function collectCompanyfacts(db: Pick<pg.Pool, "query">, http: Pick<SourceHttp, "get">, ticker: string, cik: number, dryRun = false) {
  const body = await http.get(companyfactsUrl(cik), { maxBytes: 20 * 1024 * 1024, timeoutMs: 30_000 });
  const rows = parseCompanyfacts(body, ticker);
  const bytes = Buffer.byteLength(body);
  const accessions = [...new Set(rows.map((row) => row.accession))];
  if (dryRun) return { ticker, cik, bytes, facts: rows.length, inserted: 0, accessions };
  await putSnapshot(db, { sourceId: "sec", key: `companyfacts:${cik}`, body, contentType: "application/json", meta: { ticker, cik } });
  return { ticker, cik, bytes, facts: rows.length, inserted: await insertFundamentals(db, rows), accessions };
}
