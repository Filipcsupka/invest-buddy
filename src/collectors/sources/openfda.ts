import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, parseJson, PING_REQUEST, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

const BASE = "https://api.fda.gov/drug";
/** openFDA sponsor and recalling-firm prefixes per universe symbol. CRSP's product is a CBER biologic and is usually absent from Drugs@FDA; no hits is a normal answer. */
export const FDA_FIRMS: Record<string, { sponsor: string; firm: string }> = {
  VRTX: { sponsor: "VERTEX", firm: "Vertex" },
  CRSP: { sponsor: "CRISPR", firm: "CRISPR" },
  REGN: { sponsor: "REGENERON", firm: "Regeneron" },
};
export const DISCOVERY_PAGES = 3;
const compact = (date: string) => date.replace(/-/g, "");
const dashed = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
interface Submission { submission_type?: string; submission_number?: string; submission_status?: string; submission_status_date?: string; submission_class_code_description?: string; review_priority?: string }
interface DrugApp { application_number?: string; sponsor_name?: string; products?: { brand_name?: string }[]; submissions?: Submission[] }
interface Enforcement { recall_number?: string; recalling_firm?: string; classification?: string; status?: string; reason_for_recall?: string; product_description?: string; report_date?: string; recall_initiation_date?: string }

/** openFDA answers 404 with NOT_FOUND when nothing matches. That is an empty result, not a failure. */
async function query<T>(http: SourceHttp, url: string, options = {}): Promise<T[]> {
  const body = parseJson<{ results?: T[]; error?: { code?: string; message?: string } }>(await http.get(url, { ...options, okStatuses: [404] }), "openFDA");
  if (body.error) { if (body.error.code === "NOT_FOUND") return []; throw new Error(`openFDA: ${body.error.message ?? body.error.code}`); }
  if (!Array.isArray(body.results)) throw new Error("openFDA: no results array");
  return body.results;
}

export function approvalDocuments(apps: DrugApp[], since: string, symbol: string | null, options: { originalOnly?: boolean; limit?: number } = {}): CollectedDocument[] {
  const out: CollectedDocument[] = [];
  for (const app of apps) {
    const number = app.application_number ?? "";
    const digits = number.replace(/\D/g, "");
    if (!digits) continue;
    const brands = [...new Set((app.products ?? []).map((product) => product.brand_name).filter(Boolean))].slice(0, 3).join(", ");
    for (const submission of app.submissions ?? []) {
      const date = submission.submission_status_date;
      if (!date || !/^\d{8}$/.test(date) || dashed(date) < since || submission.submission_status !== "AP") continue;
      if (options.originalOnly && submission.submission_type !== "ORIG") continue;
      const kind = `${submission.submission_type ?? "?"}-${submission.submission_number ?? "?"}`;
      out.push(sourceDocument({ source: "openfda", symbol, docType: symbol ? "FDA approval" : "FDA approval (discovery)",
        url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${digits}#${kind}`, publishedAt: `${dashed(date)}T00:00:00Z`,
        body: `${app.sponsor_name ?? "Unknown sponsor"} ${number}${brands ? ` (${brands})` : ""}: submission ${kind} approved ${dashed(date)}${submission.submission_class_code_description ? `, class ${submission.submission_class_code_description}` : ""}${submission.review_priority ? `, ${submission.review_priority} review` : ""}.`,
        meta: { signal: "productCatalyst", application: number, sponsor: app.sponsor_name ?? null, submission: kind, brands, ...(symbol ? {} : { discovery: true }) } }, LICENSES.openfda));
    }
  }
  return options.limit ? out.slice(0, options.limit) : out;
}

export function enforcementDocuments(rows: Enforcement[], since: string, symbol: string): CollectedDocument[] {
  const out: CollectedDocument[] = [];
  for (const row of rows) {
    const date = row.report_date;
    if (!row.recall_number || !date || !/^\d{8}$/.test(date) || dashed(date) < since) continue;
    out.push(sourceDocument({ source: "openfda", symbol, docType: "FDA enforcement", url: `${BASE}/enforcement.json?search=recall_number:%22${encodeURIComponent(row.recall_number)}%22`,
      publishedAt: `${dashed(date)}T00:00:00Z`,
      body: `${row.recalling_firm ?? "Unknown firm"} recall ${row.recall_number}, ${row.classification ?? "unclassified"}, ${row.status ?? "status unknown"}, reported ${dashed(date)}. Reason: ${row.reason_for_recall ?? "not stated"}. Product: ${(row.product_description ?? "").slice(0, 300)}`,
      meta: { signal: "productCatalyst", recall: row.recall_number, classification: row.classification ?? null, status: row.status ?? null } }, LICENSES.openfda));
  }
  return out;
}

export async function collectOpenfda(ctx: SourceContext): Promise<SourceOutput> {
  const documents: CollectedDocument[] = [];
  const range = `[${compact(ctx.since)}+TO+${compact(ctx.now.toISOString().slice(0, 10))}]`;
  for (const symbol of ctx.symbols) {
    const firm = FDA_FIRMS[symbol];
    if (!firm) continue;
    const apps = await query<DrugApp>(ctx.http, `${BASE}/drugsfda.json?search=sponsor_name:${firm.sponsor}*+AND+submissions.submission_status_date:${range}&limit=100`);
    documents.push(...approvalDocuments(apps, ctx.since, symbol));
    const recalls = await query<Enforcement>(ctx.http, `${BASE}/enforcement.json?search=recalling_firm:${firm.firm}*+AND+report_date:${range}&limit=50`);
    documents.push(...enforcementDocuments(recalls, ctx.since, symbol));
  }
  const universeSponsors = new Set(Object.values(FDA_FIRMS).map((firm) => firm.sponsor));
  const discovered: DrugApp[] = [];
  for (let page = 0; page < DISCOVERY_PAGES; page++) {
    const apps = await query<DrugApp>(ctx.http, `${BASE}/drugsfda.json?search=submissions.submission_status_date:${range}+AND+submissions.submission_status:AP+AND+(application_number:NDA*+application_number:BLA*)&limit=100&skip=${page * 100}`);
    discovered.push(...apps);
    if (apps.length < 100) break;
  }
  documents.push(...approvalDocuments(discovered.filter((app) => !universeSponsors.has((app.sponsor_name ?? "").split(" ")[0].toUpperCase())), ctx.since, null, { originalOnly: true, limit: 50 }));
  return { documents, facts: [] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("openfda", async () => {
  const rows = await query<DrugApp>(http, `${BASE}/drugsfda.json?limit=1`, PING_REQUEST);
  if (!rows[0]?.application_number) throw new Error("result has no application_number");
  return `${rows[0].application_number} ${rows[0].sponsor_name ?? ""}`.trim();
});
