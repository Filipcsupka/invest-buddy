import pg from "pg";
import oldSamples from "../src/research/fixtures/old-samples.json";
import { validateOldSamples, type OldSample } from "../src/research/old-samples";
import { numberTokens } from "../src/research/types";
import { publisherKey } from "../src/research/verify";

// RS8: prints the evaluation measures for stored research runs against the six old sample cards.
// Usage: DATABASE_URL=... tsx scripts/research-eval.ts <run-id>... [--max-cost-usd N] [--max-tokens N]
// Every statement is a SELECT inside a READ ONLY transaction. No network and no model calls.
// Measures that the stored rows cannot show print "needs owner" or "not measured", never a made-up number.

export type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export interface EvalItem {
  url: string; publishedAt: string | null; sourceName?: string; quote: string;
  verify?: { status: string; sourceClass?: string; pageDate?: string; canonicalUrl?: string } | null;
}
export interface EvalRun {
  id: string; run_type: string; as_of: string; status: string; cost_usd: number | null;
  input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; cache_creation_tokens: number | null;
}
export interface EvalFinding {
  run_id: string; symbol: string; kind: string; claim: string; verification_status: string; source_class: string | null;
  confirmed: boolean; lead: boolean; evidence: EvalItem[]; figures: { label: string; value: string; evidenceIndex: number }[];
}
export interface EvalCandidate { symbol: string; state: string; first_run_id: string | null }
export interface EvalEvent { symbol: string; kind: string; at: string; reason: string | null }
export interface EvalRows { runs: EvalRun[]; findings: EvalFinding[]; candidates: EvalCandidate[]; events: EvalEvent[] }
export interface EvalOptions { maxCostUsd?: number; maxTokens?: number }

export type Verdict = "pass" | "fail" | "needs owner" | "not measured";
export interface Measure { id: string; name: string; passLevel: string; verdict: Verdict; result: string; detail?: string }
export interface EvalReport { measures: Measure[]; dateDropped: number; runIds: string[] }

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const bySample = (samples: OldSample[]) => new Set(samples.map((s) => s.ticker));
const items = (f: EvalFinding) => (Array.isArray(f.evidence) ? f.evidence : []);
const day = (value: string) => value.slice(0, 10);

/** Evidence items dated after the as-of day of their run, by the model's date or the page date. Rows the validator rejected are never stored, so they are not counted. */
export function countDateDropped(rows: Pick<EvalRows, "runs" | "findings">): number {
  const asOf = new Map(rows.runs.map((r) => [r.id, day(String(r.as_of))]));
  let dropped = 0;
  for (const f of rows.findings) {
    const limit = asOf.get(f.run_id);
    if (!limit) continue;
    for (const item of items(f)) {
      const dates = [item.publishedAt, item.verify?.pageDate].filter((d): d is string => !!d).map(day);
      if (dates.some((d) => d > limit)) dropped++;
    }
  }
  return dropped;
}

/** The deep-dive finding that carries a sample's trigger: same symbol and kind. The owner confirms the claim text. */
function triggerFinding(sample: OldSample, deepDive: EvalFinding[]): EvalFinding | undefined {
  const matches = deepDive.filter((f) => f.symbol === sample.ticker && f.kind === sample.kind);
  const rank = (f: EvalFinding) => (f.verification_status === "verified" ? 0 : f.verification_status === "lead_only" ? 1 : 2);
  return [...matches].sort((a, b) => rank(a) - rank(b))[0];
}

export function computeMeasures(rows: EvalRows, samples: OldSample[], options: EvalOptions = {}): EvalReport {
  const sampleSet = bySample(samples);
  const discoveryIds = new Set(rows.runs.filter((r) => r.run_type === "weekly_discovery").map((r) => r.id));
  const deepIds = new Set(rows.runs.filter((r) => r.run_type === "deep_dive").map((r) => r.id));
  const dailyRuns = rows.runs.filter((r) => r.run_type === "daily_watch");
  const deepFindings = rows.findings.filter((f) => deepIds.has(f.run_id));
  const measures: Measure[] = [];
  const add = (m: Measure) => measures.push(m);

  // 1 Candidate recall
  if (!discoveryIds.size) add({ id: "recall", name: "Candidate recall, discovery run", passLevel: "at least 4 of 6", verdict: "not measured", result: "no weekly_discovery run given" });
  else {
    const found = [...new Set(rows.candidates.filter((c) => c.first_run_id && discoveryIds.has(c.first_run_id) && c.state !== "DROPPED" && sampleSet.has(c.symbol)).map((c) => c.symbol))];
    add({ id: "recall", name: "Candidate recall, discovery run", passLevel: "at least 4 of 6", verdict: found.length >= 4 ? "pass" : "fail",
      result: `${found.length} of ${samples.length}`, detail: `found: ${found.join(", ") || "none"}; missed: ${samples.filter((s) => !found.includes(s.ticker)).map((s) => s.ticker).join(", ") || "none"}` });
  }

  // 2 and 3 Trigger recall and evidence
  if (!deepIds.size) {
    add({ id: "trigger", name: "Trigger recall, deep dives", passLevel: "6 of 6", verdict: "not measured", result: "no deep_dive run given" });
    add({ id: "primary", name: "Trigger evidence on a primary source", passLevel: "at least 5 of 6", verdict: "not measured", result: "no deep_dive run given" });
  } else {
    const matched = samples.map((s) => ({ s, f: triggerFinding(s, deepFindings) }));
    const hit = matched.filter((m) => m.f);
    add({ id: "trigger", name: "Trigger recall, deep dives", passLevel: "6 of 6", verdict: hit.length === samples.length ? "pass" : "fail",
      result: `${hit.length} of ${samples.length}`, detail: `matched by symbol and kind, owner confirms the claim is the trigger: ${hit.map((m) => `${m.s.ticker}: ${m.f!.claim}`).join(" | ") || "none"}` });
    const primary = matched.filter((m) => m.f && m.f.verification_status === "verified" && m.f.source_class === "primary");
    add({ id: "primary", name: "Trigger evidence on a primary source", passLevel: "at least 5 of 6", verdict: primary.length >= 5 ? "pass" : "fail",
      result: `${primary.length} of ${samples.length}`, detail: `not primary: ${matched.filter((m) => !primary.includes(m)).map((m) => `${m.s.ticker} (${m.f ? `${m.f.verification_status}/${m.f.source_class ?? "none"}` : "no finding"})`).join(", ") || "none"}` });
  }

  // 4 Quote failures
  const checked = rows.findings.flatMap((f) => items(f)).filter((i) => i.verify);
  if (!checked.length) add({ id: "quotes", name: "Quote failures", passLevel: "at most 10%", verdict: "not measured", result: "no verified evidence items stored" });
  else {
    const failed = checked.filter((i) => i.verify!.status === "quote_not_found").length;
    add({ id: "quotes", name: "Quote failures", passLevel: "at most 10%", verdict: failed / checked.length <= 0.1 ? "pass" : "fail", result: `${failed} of ${checked.length} items (${pct(failed, checked.length)})` });
  }

  // 5 Figures match a verified quote
  const shown = rows.findings.filter((f) => f.verification_status === "verified");
  let figures = 0, matching = 0;
  for (const f of shown) for (const g of f.figures ?? []) {
    figures++;
    const item = items(f)[g.evidenceIndex];
    const have = new Set(numberTokens(item?.quote ?? ""));
    const wanted = numberTokens(g.value);
    if (item?.verify?.status === "verified" && wanted.length > 0 && wanted.every((t) => have.has(t))) matching++;
  }
  if (!figures) add({ id: "figures", name: "Figures match a verified quote", passLevel: "100%", verdict: "not measured", result: "no figures on verified findings" });
  else add({ id: "figures", name: "Figures match a verified quote", passLevel: "100%", verdict: matching === figures ? "pass" : "fail", result: `${matching} of ${figures} (${pct(matching, figures)})` });

  // 6 Social or unverified claims shown as facts
  const facts = rows.findings.filter((f) => f.verification_status === "verified");
  const bad = facts.filter((f) => f.lead || f.source_class === "social");
  if (!rows.findings.length) add({ id: "social", name: "Social or unverified claims shown as facts", passLevel: "0", verdict: "not measured", result: "no findings stored" });
  else add({ id: "social", name: "Social or unverified claims shown as facts", passLevel: "0", verdict: bad.length === 0 ? "pass" : "fail", result: `${bad.length} of ${facts.length} verified facts`, detail: bad.map((f) => `${f.symbol}: ${f.claim}`).join(" | ") || undefined });

  // 7 Primary links against the old card (the old links are not stored)
  const primaryLinks = samples.map((s) => {
    const urls = new Set(deepFindings.filter((f) => f.symbol === s.ticker).flatMap((f) => items(f)).filter((i) => i.verify?.status === "verified" && i.verify.sourceClass === "primary").map((i) => i.verify?.canonicalUrl ?? i.url));
    return `${s.ticker} ${urls.size}`;
  });
  add({ id: "links", name: "Primary links per card, against the old card", passLevel: "not fewer on any card", verdict: "needs owner",
    result: "old card links are not stored", detail: `new verified primary links per card: ${primaryLinks.join(", ")}` });

  // 8 UNCONFIRMED marks
  const single = rows.findings.filter((f) => {
    if (f.verification_status !== "verified") return false;
    const ok = items(f).filter((i) => i.verify?.status === "verified" && i.verify.sourceClass !== "social");
    const hasPrimary = ok.some((i) => i.verify?.sourceClass === "primary");
    const press = new Set(ok.filter((i) => i.verify?.sourceClass === "press").map((i) => publisherKey(i.verify?.canonicalUrl ?? i.url)));
    return !hasPrimary && press.size < 2;
  });
  if (!single.length) add({ id: "unconfirmed", name: "UNCONFIRMED marks on one non-primary source", passLevel: "100%", verdict: "not measured", result: "no such claims in these runs" });
  else {
    const marked = single.filter((f) => !f.confirmed).length;
    add({ id: "unconfirmed", name: "UNCONFIRMED marks on one non-primary source", passLevel: "100%", verdict: marked === single.length ? "pass" : "fail", result: `${marked} of ${single.length} (${pct(marked, single.length)})` });
  }

  // 9 Repeat alerts across two consecutive daily runs
  const days = [...new Set(dailyRuns.map((r) => day(String(r.as_of))))].sort();
  const nextDay = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const pairs = days.filter((d) => days.includes(nextDay(d)));
  if (!pairs.length) add({ id: "repeats", name: "Repeat alerts across two consecutive daily runs", passLevel: "0", verdict: "not measured", result: "needs daily_watch runs on two consecutive days" });
  else {
    let repeats = 0;
    for (const d1 of pairs) {
      const d2 = nextDay(d1);
      const on = (kind: string, d: string) => new Set(rows.events.filter((e) => e.kind === kind && day(String(e.at)) === d).map((e) => e.symbol));
      const sent1 = on("alert_sent", d1), sent2 = on("alert_sent", d2), verified2 = on("finding_verified", d2), changed2 = on("state_change", d2);
      for (const symbol of sent2) if (sent1.has(symbol) && !verified2.has(symbol) && !changed2.has(symbol)) repeats++;
    }
    add({ id: "repeats", name: "Repeat alerts across two consecutive daily runs", passLevel: "0", verdict: repeats === 0 ? "pass" : "fail", result: `${repeats} repeat alert(s) over ${pairs.length} day pair(s)`, detail: "a repeat is an alert on day 2 for a name alerted on day 1 with no new verified finding or state change on day 2" });
  }

  // 10 Tokens and cost
  const tokens = (r: EvalRun) => (r.input_tokens ?? 0) + (r.output_tokens ?? 0) + (r.cache_read_tokens ?? 0) + (r.cache_creation_tokens ?? 0);
  const totalTokens = rows.runs.reduce((sum, r) => sum + tokens(r), 0);
  const totalCost = rows.runs.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  const usage = `${rows.runs.length} runs, ${totalTokens} tokens, USD ${totalCost.toFixed(4)}`;
  const capped = options.maxTokens !== undefined || options.maxCostUsd !== undefined;
  if (!capped) add({ id: "cost", name: "Tokens and cost per run", passLevel: "within the RS5 caps", verdict: "needs owner", result: usage, detail: "caps are environment values; pass --max-tokens and --max-cost-usd per run to check" });
  else {
    const over = rows.runs.filter((r) => (options.maxTokens !== undefined && tokens(r) > options.maxTokens) || (options.maxCostUsd !== undefined && (r.cost_usd ?? 0) > options.maxCostUsd));
    add({ id: "cost", name: "Tokens and cost per run", passLevel: "within the RS5 caps", verdict: over.length === 0 ? "pass" : "fail", result: usage, detail: over.length ? `over: ${over.map((r) => r.id).join(", ")}` : undefined });
  }

  // 11 Owner grade
  add({ id: "grade", name: "Owner grade: card useful for a decision", passLevel: "at least 4 of 6", verdict: "needs owner", result: "grade the six cards by hand" });

  return { measures, dateDropped: countDateDropped(rows), runIds: rows.runs.map((r) => r.id) };
}

export function formatReport(report: EvalReport): string {
  const lines = [`Runs: ${report.runIds.join(", ") || "none"}`, "", "| Measure | Result | Pass level | Verdict |", "| --- | --- | --- | --- |"];
  for (const m of report.measures) lines.push(`| ${m.name} | ${m.result} | ${m.passLevel} | ${m.verdict} |`);
  lines.push("", `Evidence items dropped by the date rule: ${report.dateDropped}`);
  const details = report.measures.filter((m) => m.detail);
  if (details.length) lines.push("", ...details.map((m) => `- ${m.name}: ${m.detail}`));
  return lines.join("\n") + "\n";
}

export function parseEvalArgs(argv: string[]): { runIds: string[]; options: EvalOptions } {
  const runIds: string[] = [];
  const options: EvalOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max-cost-usd" || arg === "--max-tokens") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} needs a number`);
      if (arg === "--max-tokens") options.maxTokens = value; else options.maxCostUsd = value;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)) runIds.push(arg.toLowerCase());
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!runIds.length) throw new Error("Pass at least one run id");
  return { runIds, options };
}

const num = (v: unknown) => (v == null ? null : Number(v));

/** Thin loader: SELECTs only. */
export async function loadRows(db: Queryable, runIds: string[]): Promise<EvalRows> {
  const runs = (await db.query(
    `SELECT id::text, run_type, as_of::text, status, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
       FROM research_runs WHERE id = ANY($1::uuid[]) ORDER BY as_of, created_at`, [runIds])).rows.map((r) => ({
    id: String(r.id), run_type: String(r.run_type), as_of: String(r.as_of), status: String(r.status), cost_usd: num(r.cost_usd),
    input_tokens: num(r.input_tokens), output_tokens: num(r.output_tokens), cache_read_tokens: num(r.cache_read_tokens), cache_creation_tokens: num(r.cache_creation_tokens),
  }));
  const findings = (await db.query(
    `SELECT run_id::text, symbol, kind, claim, verification_status, source_class, confirmed, lead, evidence, figures
       FROM research_findings WHERE run_id = ANY($1::uuid[]) ORDER BY id`, [runIds])).rows as unknown as EvalFinding[];
  const candidates = (await db.query(
    "SELECT symbol, state, first_run_id::text FROM research_candidates WHERE first_run_id = ANY($1::uuid[])", [runIds])).rows as unknown as EvalCandidate[];
  const since = runs.map((r) => r.as_of).sort()[0] ?? null;
  const events = (await db.query(
    `SELECT symbol, kind, at::text, reason FROM research_events
      WHERE kind IN ('alert_sent','alert_suppressed','finding_verified','state_change') AND ($1::date IS NULL OR at >= $1::date) ORDER BY at`, [since])).rows as unknown as EvalEvent[];
  return { runs, findings, candidates, events };
}

async function main() {
  const { runIds, options } = parseEvalArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const errors = validateOldSamples(oldSamples);
  if (errors.length) throw new Error(`old-samples.json is invalid: ${errors.join("; ")}`);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const rows = await loadRows(client, runIds);
    await client.query("ROLLBACK");
    const missing = runIds.filter((id) => !rows.runs.some((r) => r.id === id));
    if (missing.length) console.error(`Run ids not found: ${missing.join(", ")}`);
    process.stdout.write(formatReport(computeMeasures(rows, (oldSamples.samples as OldSample[]), options)));
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && /research-eval\.ts$/.test(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "research eval failed"); process.exitCode = 1; });
}
