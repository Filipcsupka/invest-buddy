import pg from "pg";
import { liveVerifier, offVerifier, fixtureVerifier, type EvidenceRef, type EvidenceVerifier } from "../data/evidence";
import { secRevenue, type RevenueResult } from "../data/sec";

type Agent = "claude" | "codex";
export type Agreement = "agree" | "disputed" | "single" | "xbrl_override";
export interface AgentFinding { runId: string; runner: { name: Agent }; fundamentals: Record<string, unknown>; evidence: { items: EvidenceRef[] }; confidence: string }
export interface ConsensusField { symbol: string; field: string; asOf: string; value: boolean | null; agreement: Agreement; agentValues: Record<string, { value: boolean | null; runId: string }>; evidenceRefs: EvidenceRef[]; verified: boolean; reason: string }
export const fields = ["revenueAccelerating", "revenueDeclining", "epsBeat", "guidanceRaised", "guidanceCut", "productCatalyst", "insiderOrInstitutionalBuying", "narrativeChanged", "sectorRotationIntoGrowth", "dataTailwind"] as const;
const valueOf = (finding: AgentFinding | undefined, field: string): boolean | null => {
  const value = finding?.fundamentals[field];
  return typeof value === "boolean" ? value : field === "productCatalyst" && value && typeof value === "object" && typeof (value as { present?: unknown }).present === "boolean" ? (value as { present: boolean }).present : null;
};
export async function reconcileField(symbol: string, field: string, asOf: string, findings: AgentFinding[], verify: EvidenceVerifier, sec?: RevenueResult | null): Promise<ConsensusField> {
  const agents = Object.fromEntries(findings.map((item) => [item.runner.name, item])) as Partial<Record<Agent, AgentFinding>>;
  const agentValues = Object.fromEntries(findings.map((item) => [item.runner.name, { value: valueOf(item, field), runId: item.runId }]));
  const values = [valueOf(agents.claude, field), valueOf(agents.codex, field)];
  const evidenceRefs = findings.flatMap((item) => item.evidence.items.filter((entry) => entry.claim === `${field === "sectorRotationIntoGrowth" || field === "dataTailwind" ? "macro" : "fundamentals"}.${field}`));
  let agreement: Agreement = findings.length < 2 ? "single" : "disputed";
  let value: boolean | null = null;
  let verified = false;
  let reason = findings.length < 2 ? "Only one agent supplied a finding" : "Agent values differ or are unknown";
  if (findings.length === 2 && values[0] !== null && values[0] === values[1]) {
    const checks = await Promise.all(findings.map(async (item) => {
      if (item.confidence === "low") return false;
      if (values[0] === false) return true;
      const refs = item.evidence.items.filter((entry) => entry.claim === `${field === "sectorRotationIntoGrowth" || field === "dataTailwind" ? "macro" : "fundamentals"}.${field}`);
      return (await Promise.all(refs.map((entry) => verify(entry, asOf)))).some(Boolean);
    }));
    if (checks.every(Boolean)) { agreement = "agree"; value = values[0]; verified = true; reason = "Both agents agree and supporting evidence passed"; }
    else reason = "Agreement lacks verified, fresh evidence";
  }
  const deterministic = field === "revenueAccelerating" ? sec?.revenueAccelerating : field === "revenueDeclining" ? sec?.revenueDeclining : undefined;
  if (deterministic !== undefined) {
    const conflict = values.some((v) => v !== null && v !== deterministic);
    agreement = conflict ? "xbrl_override" : agreement === "agree" ? "agree" : "xbrl_override";
    value = deterministic; verified = true; reason = conflict ? `SEC revenue facts override agent claim for ${sec?.period}` : `SEC revenue facts confirm ${sec?.period}`;
    if (sec) evidenceRefs.push({ claim: `fundamentals.${field}`, url: sec.source, publishedAt: asOf, fiscalPeriod: sec.period, quote: `Revenue growth ${sec.currentGrowth.toFixed(2)}% versus ${sec.priorGrowth.toFixed(2)}%` });
  }
  if (field === "sectorRotationIntoGrowth" || field === "narrativeChanged") {
    value = null; verified = false; reason = "No written rule confirms this narrative field";
  }
  return { symbol, field, asOf, value, agreement, agentValues, evidenceRefs, verified, reason };
}
export async function runReconcile(pool: pg.Pool, asOf: string, verify: EvidenceVerifier, secLookup: (symbol: string, asOf: string) => Promise<RevenueResult | null> = secRevenue) {
  const result = await pool.query<{ symbol: string; run_id: string; runner: { name: Agent }; fundamentals: Record<string, unknown>; evidence: { items: EvidenceRef[] }; confidence: string }>("SELECT symbol,run_id,runner,fundamentals,evidence,confidence FROM scan_findings WHERE as_of=$1 AND superseded_by IS NULL AND runner->>'name' IN ('claude','codex') ORDER BY symbol,received_at DESC", [asOf]);
  const grouped = new Map<string, AgentFinding[]>();
  for (const row of result.rows) grouped.set(row.symbol, [...(grouped.get(row.symbol) ?? []), { runId: row.run_id, runner: row.runner, fundamentals: row.fundamentals, evidence: row.evidence, confidence: row.confidence }]);
  const macros = await pool.query<{ run_id: string; data: Record<string, unknown>; evidence: { items: EvidenceRef[] } }>("SELECT run_id,data,evidence FROM macro_findings WHERE as_of=$1 AND superseded_by IS NULL AND data->>'runnerName' IN ('claude','codex')", [asOf]);
  const macroFindings = macros.rows.map((row) => ({ runId: row.run_id, runner: { name: row.data.runnerName as Agent }, fundamentals: row.data, evidence: row.evidence, confidence: "high" }));
  const pending: ConsensusField[] = [];
  for (const [symbol, findings] of grouped) {
    const sec = await secLookup(symbol, asOf).catch(() => null);
    for (const field of fields) {
      const item = await reconcileField(symbol, field, asOf, field === "sectorRotationIntoGrowth" || field === "dataTailwind" ? macroFindings : findings, verify, sec);
      pending.push(item);
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of pending) await client.query(`INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
      ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,reconciled_at=now()`,
      [item.symbol,item.field,item.asOf,item.value,item.agreement,JSON.stringify(item.agentValues),JSON.stringify(item.evidenceRefs),item.verified,item.reason]);
    await client.query("INSERT INTO reconcile_runs (as_of,field_count) VALUES ($1,$2) ON CONFLICT (as_of) DO UPDATE SET completed_at=now(),field_count=EXCLUDED.field_count", [asOf,pending.length]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return pending.length;
}
async function main() {
  const args = process.argv.slice(2);
  const dateIndex = args.indexOf("--date");
  if (args.some((arg,index) => arg !== "--date" && index !== dateIndex+1)) throw new Error("Usage: reconcile [--date YYYY-MM-DD]");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const asOf = dateIndex >= 0 ? args[dateIndex+1] : (await pool.query<{ as_of: string }>("SELECT max(as_of)::text as_of FROM scan_runs")).rows[0]?.as_of;
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("No valid scan date");
    const mode = process.env.RECONCILE_VERIFY ?? "live";
    if (!["live","off","fixture"].includes(mode)) throw new Error("Invalid RECONCILE_VERIFY");
    const verifier = mode === "live" ? liveVerifier : mode === "fixture" ? fixtureVerifier : offVerifier;
    const secLookup = mode === "live" ? secRevenue : async () => null;
    const count = await runReconcile(pool,asOf,verifier,secLookup);
    process.stdout.write(`Reconciled ${count} fields for ${asOf} (${mode} evidence mode)\n`);
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])reconcile\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error); process.exitCode = 1; });
