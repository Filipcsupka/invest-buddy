import type { SourceHttp } from "../collectors/sources/client";
import { parseJson } from "../collectors/sources/common";
import type { PoolRow } from "./pool";
import { sectorFromSic, UNCLASSIFIED } from "./sector";

/** Distinct SEC form types in a company's recent filings (SEC submissions index). Used to tell domestic filers (10-K, 10-Q) from foreign ones (20-F, 6-K, 40-F). */
export function formsFromSubmissions(text: string): string[] {
  const body = parseJson<{ filings?: { recent?: { form?: unknown } } }>(text, "SEC submissions");
  const forms = body.filings?.recent?.form;
  if (!Array.isArray(forms)) return [];
  return [...new Set(forms.filter((f): f is string => typeof f === "string"))].sort();
}

/** SIC code from the SEC submissions index (`sic` is a string such as "2834"), or null when absent. */
export function sicFromSubmissions(text: string): number | null {
  const sic = parseJson<{ sic?: unknown }>(text, "SEC submissions").sic;
  const value = typeof sic === "string" || typeof sic === "number" ? Number(sic) : NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const submissionsUrl = (cik: number) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;

export type PoolRowWithForms = PoolRow & { forms: string[] | null; sic?: number | null };

/** Adds `forms` and `sic` to each pool row from one submissions fetch. A failed fetch leaves both null (unknown), never an invented value. */
export async function withForms(rows: PoolRow[], http: Pick<SourceHttp, "get">): Promise<PoolRowWithForms[]> {
  const out: PoolRowWithForms[] = [];
  for (const row of rows) {
    try {
      const text = await http.get(submissionsUrl(row.cik), { maxBytes: 20 * 1024 * 1024 });
      out.push({ ...row, forms: formsFromSubmissions(text), sic: sicFromSubmissions(text) });
    } catch { out.push({ ...row, forms: null, sic: null }); }
  }
  return out;
}

/** Applies pool facts to selection candidates: forms, four revenue quarters (frames need all four) and YoY growth, only where the database has none. Unknown pool names become candidates without bars. */
export function mergePool<T extends { ticker: string; name: string; sector: string; cik: number | null; forms: string[]; core: boolean; revenueQuarters: number; yoyGrowthPct: number | null; lastClose: number | null; avgDollarVolume50: number | null; barDays: number }>(candidates: T[], pool: PoolRowWithForms[]): T[] {
  const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
  for (const p of pool) {
    const c = byTicker.get(p.ticker);
    if (!c) {
      candidates.push({ ticker: p.ticker, name: p.name, sector: sectorFromSic(p.sic), cik: p.cik, forms: p.forms ?? [], core: false, revenueQuarters: 4, yoyGrowthPct: p.yoyPercent, lastClose: null, avgDollarVolume50: null, barDays: 0 } as T);
      continue;
    }
    if (c.core) continue;
    if (!c.forms.length && p.forms) c.forms = p.forms;
    if (c.revenueQuarters < 4) c.revenueQuarters = 4;
    if (c.yoyGrowthPct === null) c.yoyGrowthPct = p.yoyPercent;
    c.cik ??= p.cik;
    if (c.sector === UNCLASSIFIED) c.sector = sectorFromSic(p.sic);
  }
  return candidates;
}
