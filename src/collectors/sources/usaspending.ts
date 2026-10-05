import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { isoDate, LICENSES, parseJson, PING_REQUEST, round, runPing, sourceDocument, type PendingFact, type PingResult, type SourceContext, type SourceOutput } from "./common";

const URL_SEARCH = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
/** Recipient name fragments per universe symbol. Names that other companies share are matched on the full legal name. */
export const RECIPIENTS: Record<string, string> = {
  PLTR: "Palantir", MSFT: "Microsoft", GOOGL: "Google", AMZN: "Amazon Web Services", ORCL: "Oracle America", CRM: "Salesforce",
  NOW: "ServiceNow", PANW: "Palo Alto Networks", CRWD: "CrowdStrike", NVDA: "NVIDIA", AMD: "Advanced Micro Devices",
  SMCI: "Super Micro Computer", SNOW: "Snowflake", DDOG: "Datadog", ZS: "Zscaler", OKTA: "Okta", TSLA: "Tesla",
};
/** Contracts only: A to D. Grants and loans are not a revenue tailwind signal. */
const CONTRACT_CODES = ["A", "B", "C", "D"];
const FIELDS = ["Award ID", "Recipient Name", "Award Amount", "Start Date", "End Date", "Awarding Agency", "Description"];
export interface Award {
  "Award ID"?: string; "Recipient Name"?: string; "Award Amount"?: number; "Start Date"?: string; "End Date"?: string;
  "Awarding Agency"?: string; Description?: string; generated_internal_id?: string;
}
const searchBody = (recipient: string, start: string, end: string, limit: number) => ({
  filters: { recipient_search_text: [recipient], time_period: [{ start_date: start, end_date: end }], award_type_codes: CONTRACT_CODES },
  fields: FIELDS, sort: "Start Date", order: "desc", limit, page: 1,
});
async function search(http: SourceHttp, recipient: string, start: string, end: string, limit: number, options = {}): Promise<Award[]> {
  const body = parseJson<{ results?: Award[] }>(await http.post(URL_SEARCH, searchBody(recipient, start, end, limit), options), "USAspending");
  if (!Array.isArray(body.results)) throw new Error("USAspending: no results array");
  return body.results;
}

export function awardDocuments(awards: Award[], symbol: string, recipient: string): CollectedDocument[] {
  const out: CollectedDocument[] = [];
  for (const award of awards) {
    const start = award["Start Date"];
    if (!award.generated_internal_id || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !(award["Recipient Name"] ?? "").toUpperCase().includes(recipient.toUpperCase())) continue;
    const amount = Number(award["Award Amount"]);
    out.push(sourceDocument({ source: "usaspending", symbol, docType: "contract award", url: `https://www.usaspending.gov/award/${encodeURIComponent(award.generated_internal_id)}`, publishedAt: `${start}T00:00:00Z`,
      body: `${award["Recipient Name"]} contract ${award["Award ID"] ?? "(no id)"} with ${award["Awarding Agency"] ?? "unknown agency"}: $${Number.isFinite(amount) ? round(amount, 0) : "n/a"}, ${start} to ${award["End Date"] ?? "n/a"}. ${(award.Description ?? "").slice(0, 400)}`,
      meta: { signal: "dataTailwind", awardId: award["Award ID"] ?? null, amount: Number.isFinite(amount) ? amount : null, agency: award["Awarding Agency"] ?? null, endDate: award["End Date"] ?? null } }, LICENSES.usaspending));
  }
  return out;
}

export async function collectUsaspending(ctx: SourceContext): Promise<SourceOutput> {
  const documents: CollectedDocument[] = [], facts: PendingFact[] = [];
  const end = isoDate(ctx.now);
  for (const symbol of ctx.symbols) {
    const recipient = RECIPIENTS[symbol];
    if (!recipient) continue;
    const docs = awardDocuments(await search(ctx.http, recipient, ctx.since, end, 10), symbol, recipient);
    documents.push(...docs);
    if (docs.length) facts.push({ symbol, key: "gov_contract_awards_window", asOf: docs.map((doc) => doc.publishedAt.slice(0, 10)).sort().at(-1)!, documentUrls: docs.map((doc) => doc.url),
      value: { since: ctx.since, count: docs.length, totalUsd: round(docs.reduce((sum, doc) => sum + (Number(doc.meta.amount) || 0), 0), 0), note: "newest 10 awards only" } });
  }
  return { documents, facts };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("usaspending", async () => {
  const end = isoDate(new Date());
  const rows = await search(http, "Palantir", isoDate(new Date(Date.now() - 365 * 86400000)), end, 1, PING_REQUEST);
  if (!rows[0]?.generated_internal_id) throw new Error("award has no generated_internal_id");
  return `${rows[0]["Recipient Name"] ?? "?"} ${rows[0]["Start Date"] ?? ""}`.trim();
});
