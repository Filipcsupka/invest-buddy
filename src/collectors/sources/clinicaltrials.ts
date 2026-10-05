import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, parseJson, PING_REQUEST, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

const BASE = "https://clinicaltrials.gov/api/v2/studies";
const FIELDS = "NCTId,BriefTitle,OverallStatus,Phase,LastUpdatePostDate,LeadSponsorName,PrimaryCompletionDate,StartDate";
/** Lead sponsor query per universe symbol. */
export const CT_SPONSORS: Record<string, { lead: string; match: RegExp }> = {
  VRTX: { lead: "Vertex Pharmaceuticals", match: /^Vertex Pharmaceuticals/i },
  CRSP: { lead: "CRISPR Therapeutics", match: /^CRISPR Therapeutics/i },
  REGN: { lead: "Regeneron Pharmaceuticals", match: /^Regeneron/i },
};
/** Keyword discovery: recent phase 2 and 3 trials from any sponsor. */
export const CT_KEYWORDS = ["obesity", "gene editing", "sickle cell"];
export const PAGE_SIZE = 50;
const DISCOVERY_PAGE_SIZE = 10;

export interface Study {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string }; primaryCompletionDateStruct?: { date?: string }; lastUpdatePostDateStruct?: { date?: string } };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    designModule?: { phases?: string[] };
  };
}
const url = (params: Record<string, string>) => `${BASE}?${Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&fields=${FIELDS}`;
async function studies(http: SourceHttp, address: string, options = {}): Promise<Study[]> {
  const body = parseJson<{ studies?: Study[] }>(await http.get(address, options), "ClinicalTrials.gov");
  if (!Array.isArray(body.studies)) throw new Error("ClinicalTrials.gov: no studies array");
  return body.studies;
}

export function studyDocument(study: Study, symbol: string | null, since: string, keyword?: string): CollectedDocument | undefined {
  const id = study.protocolSection?.identificationModule?.nctId;
  const status = study.protocolSection?.statusModule;
  const updated = status?.lastUpdatePostDateStruct?.date;
  if (!id || !/^NCT\d{8}$/.test(id) || !updated || !/^\d{4}-\d{2}-\d{2}$/.test(updated) || updated < since) return undefined;
  const sponsor = study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ?? "unknown sponsor";
  const phases = (study.protocolSection?.designModule?.phases ?? []).join("/") || "not stated";
  const title = study.protocolSection?.identificationModule?.briefTitle ?? "";
  return sourceDocument({ source: "clinicaltrials", symbol, docType: symbol ? "clinical trial update" : "clinical trial update (discovery)", url: `https://clinicaltrials.gov/study/${id}`,
    publishedAt: `${updated}T00:00:00Z`,
    body: `${id} ${title}. Lead sponsor ${sponsor}. Status ${status?.overallStatus ?? "unknown"}, phase ${phases}, started ${status?.startDateStruct?.date ?? "n/a"}, primary completion ${status?.primaryCompletionDateStruct?.date ?? "n/a"}, last update posted ${updated}.`,
    meta: { signal: "productCatalyst", nctId: id, sponsor, status: status?.overallStatus ?? null, phases: study.protocolSection?.designModule?.phases ?? [], primaryCompletion: status?.primaryCompletionDateStruct?.date ?? null, ...(keyword ? { discovery: true, keyword } : {}) } }, LICENSES.clinicaltrials);
}

export async function collectClinicalTrials(ctx: SourceContext): Promise<SourceOutput> {
  const documents: CollectedDocument[] = [];
  const range = `AREA[LastUpdatePostDate]RANGE[${ctx.since},MAX]`;
  for (const symbol of ctx.symbols) {
    const sponsor = CT_SPONSORS[symbol];
    if (!sponsor) continue;
    for (const study of await studies(ctx.http, url({ "query.lead": sponsor.lead, "filter.advanced": range, sort: "LastUpdatePostDate:desc", pageSize: String(PAGE_SIZE) }))) {
      if (!sponsor.match.test(study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ?? "")) continue;
      const doc = studyDocument(study, symbol, ctx.since);
      if (doc) documents.push(doc);
    }
  }
  const owned = new Set(Object.values(CT_SPONSORS).map((sponsor) => sponsor.match));
  for (const keyword of CT_KEYWORDS) {
    for (const study of await studies(ctx.http, url({ "query.term": keyword, "filter.advanced": `${range} AND (AREA[Phase]PHASE2 OR AREA[Phase]PHASE3)`, sort: "LastUpdatePostDate:desc", pageSize: String(DISCOVERY_PAGE_SIZE) }))) {
      if ([...owned].some((match) => match.test(study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ?? ""))) continue;
      const doc = studyDocument(study, null, ctx.since, keyword);
      if (doc && !documents.some((existing) => existing.url === doc.url)) documents.push(doc);
    }
  }
  return { documents, facts: [] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("clinicaltrials", async () => {
  const rows = await studies(http, url({ "query.term": "obesity", pageSize: "1" }), PING_REQUEST);
  const id = rows[0]?.protocolSection?.identificationModule?.nctId;
  if (!id) throw new Error("study has no nctId");
  return `${id} ${rows[0].protocolSection?.statusModule?.overallStatus ?? ""}`.trim();
});
