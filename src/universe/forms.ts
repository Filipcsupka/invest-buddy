import type { SourceHttp } from "../collectors/sources/client";
import { parseJson } from "../collectors/sources/common";
import type { PoolRow } from "./pool";

/** Distinct SEC form types in a company's recent filings (SEC submissions index). Used to tell domestic filers (10-K, 10-Q) from foreign ones (20-F, 6-K, 40-F). */
export function formsFromSubmissions(text: string): string[] {
  const body = parseJson<{ filings?: { recent?: { form?: unknown } } }>(text, "SEC submissions");
  const forms = body.filings?.recent?.form;
  if (!Array.isArray(forms)) return [];
  return [...new Set(forms.filter((f): f is string => typeof f === "string"))].sort();
}

export const submissionsUrl = (cik: number) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;

export type PoolRowWithForms = PoolRow & { forms: string[] | null };

/** Adds `forms` to each pool row. A failed fetch leaves null (unknown), never an invented form. */
export async function withForms(rows: PoolRow[], http: Pick<SourceHttp, "get">): Promise<PoolRowWithForms[]> {
  const out: PoolRowWithForms[] = [];
  for (const row of rows) {
    try { out.push({ ...row, forms: formsFromSubmissions(await http.get(submissionsUrl(row.cik), { maxBytes: 20 * 1024 * 1024 })) }); }
    catch { out.push({ ...row, forms: null }); }
  }
  return out;
}

/** Applies pool facts to selection candidates: forms, four revenue quarters (frames need all four) and YoY growth, only where the database has none. Unknown pool names become candidates without bars. */
export function mergePool<T extends { ticker: string; name: string; sector: string; cik: number | null; forms: string[]; core: boolean; revenueQuarters: number; yoyGrowthPct: number | null; lastClose: number | null; avgDollarVolume50: number | null; barDays: number }>(candidates: T[], pool: PoolRowWithForms[]): T[] {
  const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
  for (const p of pool) {
    const c = byTicker.get(p.ticker);
    if (!c) {
      candidates.push({ ticker: p.ticker, name: p.name, sector: "Unclassified", cik: p.cik, forms: p.forms ?? [], core: false, revenueQuarters: 4, yoyGrowthPct: p.yoyPercent, lastClose: null, avgDollarVolume50: null, barDays: 0 } as T);
      continue;
    }
    if (c.core) continue;
    if (!c.forms.length && p.forms) c.forms = p.forms;
    if (c.revenueQuarters < 4) c.revenueQuarters = 4;
    if (c.yoyGrowthPct === null) c.yoyGrowthPct = p.yoyPercent;
    c.cik ??= p.cik;
  }
  return candidates;
}
