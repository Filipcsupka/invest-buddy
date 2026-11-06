import { runLoggedJob } from "./job-log";
import pg from "pg";
import { liveVerifier, offVerifier, fixtureVerifier, freshnessDays, type EvidenceRef, type EvidenceVerifier } from "../data/evidence";
import { pgDocumentLookup, storedFirstVerifier, storedOnlyVerifier } from "../data/stored-evidence";
import { epsBeatMinSurprisePct, type EpsResult } from "../data/eps";
import { secRevenue, revenueLookup, type RevenueResult } from "../data/sec";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { carryField, carryForwardEnabled, type CarriedField, type ConsensusRow } from "../data/carry-forward";
import { isIsoDate } from "../db/iso-date";
import { insiderMinNetBuyUsd, type InsiderResult } from "../data/insider";
import { loadEpsSurprise, loadInsider } from "../db/collectors";
import { loadCatalyst, type CatalystResult } from "../data/catalyst";

type Agent = "claude" | "codex";
/**
 * agree: two agents, same value, evidence passed. verified_single: one extractor whose quote matched stored, display-allowed text.
 * xbrl_override: SEC data decides. data_rule: a deterministic rule on a collected fact decides (epsBeat from Alpha Vantage).
 */
export type Agreement = "agree" | "disputed" | "single" | "xbrl_override" | "verified_single" | "data_rule" | "research_verified";
export interface AgentFinding { runId: string; runner: { name: Agent }; fundamentals: Record<string, unknown>; evidence: { items: EvidenceRef[] }; confidence: string }
export interface ConsensusField { symbol: string; field: string; asOf: string; value: boolean | null; agreement: Agreement; agentValues: Record<string, { value: boolean | null; runId: string }>; evidenceRefs: EvidenceRef[]; verified: boolean; reason: string }
export const fields = ["revenueAccelerating", "revenueDeclining", "epsBeat", "guidanceRaised", "guidanceCut", "productCatalyst", "insiderOrInstitutionalBuying", "narrativeChanged", "sectorRotationIntoGrowth", "dataTailwind"] as const;
const MACRO_FIELDS = new Set(["sectorRotationIntoGrowth", "dataTailwind"]);
/** Narrative fields have no written rule; reconcile always stores them as unknown. */
const FORCED_NULL_FIELDS = new Set(["sectorRotationIntoGrowth", "narrativeChanged"]);
const valueOf = (finding: AgentFinding | undefined, field: string): boolean | null => {
  const value = finding?.fundamentals[field];
  return typeof value === "boolean" ? value : field === "productCatalyst" && value && typeof value === "object" && typeof (value as { present?: unknown }).present === "boolean" ? (value as { present: boolean }).present : null;
};
/**
 * `storedVerify` checks a quote against stored, display-allowed source_documents text only (no live fetch). Without it a single
 * extractor's finding stays `single`. `eps` is the Alpha Vantage rule result for epsBeat.
 */
export interface ResearchReading { field: "productCatalyst" | "guidanceRaised" | "guidanceCut"; runId: string; url: string; quote: string; publishedAt: string; value: true }
export interface ResearchRow { symbol: string; field: ResearchReading["field"]; run_id: string; verification_status: string; confirmed: boolean; source_class: string; lead: boolean; polarity: string; evidence: { url: string; status: string; sourceClass: string; pageDate?: string }[]; original_evidence: { url: string; quote: string; publishedAt: string | null }[] }
export function primaryResearchReadings(rows: ResearchRow[], asOf: string): Map<string, ResearchReading[]> {
  const bySymbol = new Map<string, ResearchReading[]>();
  for (const row of rows) {
    if (row.verification_status !== "verified" || !row.confirmed || row.source_class !== "primary" || row.lead || row.field === "productCatalyst" && row.polarity !== "positive") continue;
    for (const item of row.evidence) {
      if (item.status !== "verified" || item.sourceClass !== "primary") continue;
      const original = row.original_evidence.find((e) => e.url === item.url);
      const publishedAt = (original?.publishedAt ?? item.pageDate)?.slice(0, 10);
      const age = publishedAt ? (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${publishedAt}T00:00:00Z`)) / 86_400_000 : NaN;
      if (!original || !Number.isFinite(age) || age < 0 || age > freshnessDays[row.field]) continue;
      const list = bySymbol.get(row.symbol) ?? [];
      list.push({ field: row.field, runId: row.run_id, url: item.url, quote: original.quote, publishedAt: publishedAt!, value: true });
      bySymbol.set(row.symbol, list);
    }
  }
  return bySymbol;
}
export interface ReconcileExtras { storedVerify?: EvidenceVerifier; eps?: EpsResult | null; catalyst?: CatalystResult | null; research?: ResearchReading[] }
export async function reconcileField(symbol: string, field: string, asOf: string, findings: AgentFinding[], verify: EvidenceVerifier, sec?: RevenueResult | null, insider?: InsiderResult | null, extras: ReconcileExtras = {}): Promise<ConsensusField> {
  const agents = Object.fromEntries(findings.map((item) => [item.runner.name, item])) as Partial<Record<Agent, AgentFinding>>;
  const agentValues = Object.fromEntries(findings.map((item) => [item.runner.name, { value: valueOf(item, field), runId: item.runId }]));
  const values = [valueOf(agents.claude, field), valueOf(agents.codex, field)];
  const claim = `${MACRO_FIELDS.has(field) ? "macro" : "fundamentals"}.${field}`;
  const evidenceRefs = findings.flatMap((item) => item.evidence.items.filter((entry) => entry.claim === claim));
  let agreement: Agreement = findings.length < 2 ? "single" : "disputed";
  let value: boolean | null = null;
  let verified = false;
  let reason = findings.length < 2 ? "Only one agent supplied a finding" : "Agent values differ or are unknown";
  if (findings.length === 2 && values[0] !== null && values[0] === values[1]) {
    const checks = await Promise.all(findings.map(async (item) => {
      if (item.confidence === "low") return false;
      if (values[0] === false) return true;
      const refs = item.evidence.items.filter((entry) => entry.claim === claim);
      return (await Promise.all(refs.map((entry) => verify(entry, asOf)))).some(Boolean);
    }));
    if (checks.every(Boolean)) { agreement = "agree"; value = values[0]; verified = true; reason = value === false ? "Both agents independently report false" : "Both agents agree and supporting evidence passed"; }
    else reason = "Agreement lacks verified, fresh evidence";
  }
  // One extractor (the script-first pipeline): its true/false claim counts when at least one cited quote is found verbatim in a stored,
  // display-allowed document inside the field's window. False needs a verified quote too. Null stays unknown. Macro fields are not covered.
  const single = findings.length === 1 ? findings[0] : undefined;
  const singleValue = valueOf(single, field);
  if (single && extras.storedVerify && singleValue !== null && !MACRO_FIELDS.has(field) && !FORCED_NULL_FIELDS.has(field)) {
    const refs = single.evidence.items.filter((entry) => entry.claim === claim);
    const passed = single.confidence !== "low" && (await Promise.all(refs.map((entry) => extras.storedVerify!(entry, asOf)))).some(Boolean);
    if (passed) { agreement = "verified_single"; value = singleValue; verified = true; reason = `One extractor (${single.runner.name}); its quote matched stored source text`; }
    else reason = single.confidence === "low" ? "One extractor with low confidence" : "One extractor; no cited quote matched stored, display-allowed source text";
  }
  const deterministic = field === "revenueAccelerating" ? sec?.revenueAccelerating : field === "revenueDeclining" ? sec?.revenueDeclining : undefined;
  if (deterministic !== undefined) {
    const conflict = values.some((v) => v !== null && v !== deterministic);
    agreement = conflict ? "xbrl_override" : agreement === "agree" ? "agree" : "xbrl_override";
    value = deterministic; verified = true;
    const revenueSource = sec?.source.includes("eodhd.com") ? "EODHD" : "SEC";
    reason = conflict ? `${revenueSource} revenue facts override agent claim for ${sec?.period}` : `${revenueSource} revenue facts confirm ${sec?.period}`;
    if (sec) evidenceRefs.push({ claim: `fundamentals.${field}`, url: sec.source, publishedAt: asOf, fiscalPeriod: sec.period, quote: `Revenue growth ${sec.currentGrowth.toFixed(2)}% versus ${sec.priorGrowth.toFixed(2)}%` });
  }
  if (field === "insiderOrInstitutionalBuying" && insider && insider.value !== null) {
    // Stored Form 4 lines decide, like SEC revenue facts. A conflicting agent claim is overridden and the reason says so. The page names the source SEC Form 4.
    const conflict = values.some((v) => v !== null && v !== insider.value);
    agreement = conflict ? "xbrl_override" : agreement === "agree" ? "agree" : "xbrl_override";
    value = insider.value; verified = true; reason = conflict ? `${insider.reason}; overrides agent claim` : `${insider.reason}; confirmed by SEC data`;
    evidenceRefs.splice(0, evidenceRefs.length, ...insider.refs);
  }
  if (field === "epsBeat" && extras.eps && extras.eps.value !== null) {
    // The Alpha Vantage surprise decides, like SEC data. Agent values stay in agentValues; the cited url is the stored, non-display document.
    const eps = extras.eps;
    const conflict = values.some((v) => v !== null && v !== eps.value);
    agreement = "data_rule"; value = eps.value; verified = true; reason = conflict ? `${eps.reason}; overrides agent claim` : eps.reason;
    evidenceRefs.splice(0, evidenceRefs.length, ...eps.refs);
  }
  if (field === "productCatalyst" && extras.catalyst && extras.catalyst.value !== null && !(verified && value !== null && (agreement === "agree" || agreement === "verified_single"))) {
    // Stored 8-K text decides, unless a verified extractor result already stands (two agreeing agents, or one whose quote matched stored text).
    const rule = extras.catalyst;
    agreement = "data_rule"; value = rule.value; verified = true; reason = rule.reason;
    evidenceRefs.splice(0, evidenceRefs.length, ...rule.refs);
  }
  const research = (extras.research ?? []).filter((item) => item.field === field);
  if (research.length && agreement !== "data_rule" && agreement !== "xbrl_override") {
    evidenceRefs.push(...research.map((item) => ({ claim, url: item.url, publishedAt: item.publishedAt, quote: item.quote })));
    const extractValues = findings.map((item) => valueOf(item, field)).filter((item): item is boolean => item !== null);
    if (extractValues.includes(false)) {
      agreement = "disputed"; value = null; verified = false; reason = "Verified primary research conflicts with the extraction reading";
    } else if (extractValues.includes(true)) {
      const extractChecked = (await Promise.all(findings.filter((item) => valueOf(item, field) === true && item.confidence !== "low")
        .flatMap((item) => item.evidence.items.filter((entry) => entry.claim === claim))
        .map((entry) => verify(entry, asOf)))).some(Boolean);
      if (extractChecked) { agreement = "agree"; value = true; verified = true; reason = "Extraction and verified primary research agree"; }
    } else if (!extractValues.length) {
      agreement = "research_verified"; value = true; verified = true; reason = "Verified primary research; no extraction reading";
    }
  }
  if (FORCED_NULL_FIELDS.has(field)) {
    value = null; verified = false; reason = "No written rule confirms this narrative field";
  }
  return { symbol, field, asOf, value, agreement, agentValues, evidenceRefs, verified, reason };
}
const upsertLegacy = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
      ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,reconciled_at=now()`;
// Same as the legacy upsert, and clears a carried tag when a real finding replaces a carried row. Used only with CARRY_FORWARD=on.
const upsertFresh = upsertLegacy.replace("reconciled_at=now()", "carried_from=NULL,reconciled_at=now()");
const upsertCarried = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason,carried_from)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
      ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,carried_from=EXCLUDED.carried_from,reconciled_at=now()`;
export interface RunExtras { storedVerify?: EvidenceVerifier; epsLookup?: (symbol: string, asOf: string) => Promise<EpsResult | null>; catalystLookup?: (symbol: string, asOf: string) => Promise<CatalystResult | null> }
export async function runReconcile(pool: pg.Pool, asOf: string, verify: EvidenceVerifier, secLookup: (symbol: string, asOf: string) => Promise<RevenueResult | null> = secRevenue, insiderLookup: (symbol: string, asOf: string) => Promise<InsiderResult | null> = (symbol, date) => loadInsider(pool, symbol, date, insiderMinNetBuyUsd()), extras: RunExtras = {}) {
  const catalystLookup = extras.catalystLookup ?? ((symbol: string, date: string) => loadCatalyst(pool, symbol, date));
  const epsLookup = extras.epsLookup ?? ((symbol: string, date: string) => loadEpsSurprise(pool, symbol, date, epsBeatMinSurprisePct()));
  const result = await pool.query<{ symbol: string; run_id: string; runner: { name: Agent }; fundamentals: Record<string, unknown>; evidence: { items: EvidenceRef[] }; confidence: string }>("SELECT symbol,run_id,runner,fundamentals,evidence,confidence FROM scan_findings WHERE as_of=$1 AND superseded_by IS NULL AND runner->>'name' IN ('claude','codex') ORDER BY symbol,received_at DESC", [asOf]);
  const grouped = new Map<string, AgentFinding[]>();
  for (const row of result.rows) grouped.set(row.symbol, [...(grouped.get(row.symbol) ?? []), { runId: row.run_id, runner: row.runner, fundamentals: row.fundamentals, evidence: row.evidence, confidence: row.confidence }]);
  const researchRows = await pool.query<ResearchRow>(
    `SELECT f.symbol,f.field,f.run_id,f.verification_status,f.confirmed,f.source_class,f.lead,f.polarity,
       f.evidence,original.item->'evidence' AS original_evidence
     FROM research_findings f JOIN research_runs r ON r.id=f.run_id
     JOIN LATERAL jsonb_array_elements(r.model_output->'findings') AS original(item) ON original.item->>'id'=f.finding_key
     WHERE r.as_of <= $1::date AND f.verification_status='verified' AND f.confirmed AND f.source_class='primary'
       AND NOT f.lead AND f.field IN ('productCatalyst','guidanceRaised','guidanceCut')
       AND (f.field <> 'productCatalyst' OR f.polarity='positive')
       AND (f.event_date IS NULL OR f.event_date <= $1::date)`, [asOf]);
  const researchBySymbol = primaryResearchReadings(researchRows.rows, asOf);
  for (const symbol of researchBySymbol.keys()) if (!grouped.has(symbol)) grouped.set(symbol, []);
  const macros = await pool.query<{ run_id: string; data: Record<string, unknown>; evidence: { items: EvidenceRef[] } }>("SELECT run_id,data,evidence FROM macro_findings WHERE as_of=$1 AND superseded_by IS NULL AND data->>'runnerName' IN ('claude','codex')", [asOf]);
  const macroFindings = macros.rows.map((row) => ({ runId: row.run_id, runner: { name: row.data.runnerName as Agent }, fundamentals: row.data, evidence: row.evidence, confidence: "high" }));
  const pending: ConsensusField[] = [];
  // The macro job (src/jobs/macro.ts) stores deterministic macro rows with agreement data_rule before this step. Agents must not overwrite them.
  const rules = await pool.query<{ symbol: string; field: string }>("SELECT symbol,field FROM consensus_findings WHERE as_of=$1 AND agreement='data_rule'", [asOf]);
  const ruleRows = new Set(rules.rows.map((row) => `${row.symbol}:${row.field}`));
  for (const [symbol, findings] of grouped) {
    const sec = await secLookup(symbol, asOf).catch(() => null);
    const insider = await insiderLookup(symbol, asOf);
    const eps = await epsLookup(symbol, asOf);
    const catalyst = await catalystLookup(symbol, asOf);
    for (const field of fields) {
      // Reconcile writes its own productCatalyst data_rule rows, so a rerun may refresh them; macro rows stay untouched.
      if (ruleRows.has(`${symbol}:${field}`) && field !== "productCatalyst") continue;
      const item = await reconcileField(symbol, field, asOf, MACRO_FIELDS.has(field) ? macroFindings : findings, verify, sec, insider, { storedVerify: extras.storedVerify, eps, catalyst, research: researchBySymbol.get(symbol) });
      pending.push(item);
    }
  }
  // CARRY_FORWARD=on: a symbol with no findings on this date keeps its latest consensus per field while the field's window allows, tagged with its origin date.
  const carry = carryForwardEnabled();
  const carried: CarriedField[] = [];
  if (carry) {
    const latest = await pool.query<ConsensusRow & { symbol: string }>("SELECT DISTINCT ON (symbol,field) symbol,field,as_of::text AS as_of,value,agreement,agent_values,evidence_refs,verified,reason,carried_from::text AS carried_from FROM consensus_findings WHERE as_of < $1 ORDER BY symbol,field,as_of DESC", [asOf]);
    for (const row of latest.rows) if (!grouped.has(row.symbol) && (fields as readonly string[]).includes(row.field) && !ruleRows.has(`${row.symbol}:${row.field}`)) carried.push(carryField(row, asOf));
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of pending) await client.query(carry ? upsertFresh : upsertLegacy,
      [item.symbol,item.field,item.asOf,item.value,item.agreement,JSON.stringify(item.agentValues),JSON.stringify(item.evidenceRefs),item.verified,item.reason]);
    for (const item of carried) await client.query(upsertCarried,
      [item.symbol,item.field,item.asOf,item.value,item.agreement,JSON.stringify(item.agentValues),JSON.stringify(item.evidenceRefs),item.verified,item.reason,item.carriedFrom]);
    await client.query("INSERT INTO reconcile_runs (as_of,field_count) VALUES ($1,$2) ON CONFLICT (as_of) DO UPDATE SET completed_at=now(),field_count=EXCLUDED.field_count", [asOf,pending.length + carried.length]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return pending.length + carried.length;
}
/** RECONCILE_VERIFY=live checks citations against stored source_documents first and fetches the live page only for urls that are not stored. */
export function selectVerifier(mode: string, pool: pg.Pool): EvidenceVerifier {
  return mode === "live" ? storedFirstVerifier(pgDocumentLookup(pool), liveVerifier) : mode === "fixture" ? fixtureVerifier : offVerifier;
}
/** Live evidence checks call SEC, so they need a real contact in SEC_USER_AGENT. Other modes do not. */
export function guardReconcileUserAgent(mode: string, env: Record<string, string | undefined>): void {
  if (mode === "live") requireSecUserAgent(env.SEC_USER_AGENT);
}

async function main() {
  const args = process.argv.slice(2);
  const dateIndex = args.indexOf("--date");
  if (args.some((arg,index) => arg !== "--date" && index !== dateIndex+1)) throw new Error("Usage: reconcile [--date YYYY-MM-DD]");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const asOf = dateIndex >= 0 ? args[dateIndex+1] : (await pool.query<{ as_of: string }>("SELECT max(as_of)::text as_of FROM scan_runs")).rows[0]?.as_of;
    if (!asOf || !isIsoDate(asOf)) throw new Error("No valid scan date");
    const mode = process.env.RECONCILE_VERIFY ?? "live";
    if (!["live","off","fixture"].includes(mode)) throw new Error("Invalid RECONCILE_VERIFY");
    guardReconcileUserAgent(mode, process.env);
    const verifier = selectVerifier(mode, pool);
    // Stored SEC facts (fundamentals_pit) first; the live SEC fetch only in live mode and only when the store has no answer.
    const secLookup = revenueLookup(pool, mode === "live" ? secRevenue : undefined);
    // A single extractor's finding is checked only against stored, display-allowed text, and only in live mode.
    const storedVerify = mode === "live" ? storedOnlyVerifier(pgDocumentLookup(pool)) : undefined;
    const count = await runReconcile(pool,asOf,verifier,secLookup,undefined,{ storedVerify });
    process.stdout.write(`Reconciled ${count} fields for ${asOf} (${mode} evidence mode)\n`);
    return { fields: count, failures: 0 };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])reconcile\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("reconcile", main);
