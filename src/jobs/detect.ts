import { runLoggedJob } from "./job-log";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { loadUniverse } from "../db/universe";
import { isIsoDate } from "../db/iso-date";
import { GATE } from "./gate-config";

export interface Filing { symbol: string; accession: string; form: string; items: string }
export interface InsiderFiling { symbol: string; accession: string; date: string; ownerCik: string | null; trades: { code: string; date: string }[]; isNew?: boolean }
export interface Band { symbol: string; current: number; previous: number }
export interface ResearchDocument { symbol: string; id: number }
export const relevantFiling = (f: Pick<Filing, "form" | "items">) =>
  /^(10-Q|10-K)(\/A)?$/.test(f.form) || /^8-K(\/A)?$/.test(f.form) && /(?:^|[,\s])(?:2\.02|4\.02|5\.02|7\.01|8\.01)(?:$|[,\s])/.test(f.items);

export interface CatalystConsensus { symbol: string; asOf: string | null; value: boolean | null }
/** Oldest reviews first so a null answer cannot starve the rest of the universe. */
export function catalystReviewSymbols(rows: CatalystConsensus[], today: string, limit = GATE.catalystReviewPerNight): string[] {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - GATE.catalystReviewDays * 86400000).toISOString().slice(0, 10);
  return rows.filter((row) => row.asOf === null || row.value === null || row.asOf < cutoff)
    .sort((a, b) => (a.asOf ?? "").localeCompare(b.asOf ?? "") || a.symbol.localeCompare(b.symbol))
    .slice(0, limit).map((row) => row.symbol);
}

export function insiderCluster(rows: InsiderFiling[], today: string, count = GATE.insiderBuys, days = GATE.insiderDays): string[] {
  const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - days);
  const from = start.toISOString().slice(0, 10);
  const prior = rows.filter((r) => r.date < from && r.ownerCik);
  const bySymbol = new Map<string, Set<string>>(), hasNew = new Set<string>();
  for (const r of rows) {
    if (r.date < from || r.date > today || !r.ownerCik || !r.trades.some((t) => t.code === "P" && t.date >= from && t.date <= today)) continue;
    const routine = prior.some((p) => p.symbol === r.symbol && p.ownerCik === r.ownerCik && p.date.slice(5, 7) === r.date.slice(5, 7) && p.trades.some((t) => t.code === "P"));
    if (!routine) {
      if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, new Set());
      bySymbol.get(r.symbol)!.add(r.accession);
      if (r.isNew !== false) hasNew.add(r.symbol);
    }
  }
  return [...bySymbol].filter(([symbol, accessions]) => accessions.size >= count && hasNew.has(symbol)).map(([symbol]) => symbol);
}
export const drawdownHit = (band: Band, threshold = GATE.drawdownPct) => band.current <= -threshold && band.previous > -threshold;
export const valuationHit = (band: Band, threshold = GATE.valuationPe) => band.current <= threshold && band.previous > threshold;

export function gateSymbols(input: { filings: Filing[]; insiders: InsiderFiling[]; drawdowns: Band[]; valuations: Band[]; researchDocuments?: ResearchDocument[]; newSymbols?: string[]; catalystReviews?: string[]; today: string }, order: string[]) {
  const reasons: Record<string, string[]> = {};
  const add = (symbol: string, reason: string) => { (reasons[symbol] ??= []).push(reason); };
  for (const f of input.filings) if (relevantFiling(f)) add(f.symbol, `${f.form} ${f.accession}`);
  for (const d of input.researchDocuments ?? []) add(d.symbol, `verified research document ${d.id}`);
  for (const symbol of insiderCluster(input.insiders, input.today)) add(symbol, "opportunistic insider buy cluster");
  for (const b of input.drawdowns) if (drawdownHit(b)) add(b.symbol, `drawdown band ${GATE.drawdownPct}%`);
  for (const b of input.valuations) if (valuationHit(b)) add(b.symbol, `valuation P/E band ${GATE.valuationPe}`);
  for (const symbol of input.newSymbols ?? []) add(symbol, "approved discovery candidate awaiting first extraction");
  for (const symbol of input.catalystReviews ?? []) add(symbol, "catalyst review due");
  const symbols = order.filter((s) => reasons[s]);
  return { symbols, reasons: Object.fromEntries(symbols.map((s) => [s, reasons[s]])) };
}

export interface GatePayload { asOf: string; symbols: string[]; reasons: Record<string, string[]>; accessions: Record<string, string[]>; revision?: number }
/** One durable gate per run date. A later detect adds new work without reopening an unchanged, consumed gate. */
export async function persistGate(db: Pick<pg.Pool, "query">, gate: GatePayload): Promise<GatePayload> {
  const result = await db.query<{ gate_date: string; symbols: string[]; reasons: Record<string, string[]>; accessions: Record<string, string[]>; revision: number }>(
    `INSERT INTO scheduled_gates (gate_date,symbols,reasons,accessions) VALUES ($1::date,$2::text[],$3::jsonb,$4::jsonb)
     ON CONFLICT (gate_date) DO UPDATE SET
       symbols=ARRAY(SELECT DISTINCT unnest(scheduled_gates.symbols || EXCLUDED.symbols) ORDER BY 1),
       reasons=scheduled_gates.reasons || EXCLUDED.reasons,
       accessions=scheduled_gates.accessions || EXCLUDED.accessions,
       revision=scheduled_gates.revision + CASE WHEN EXCLUDED.symbols <@ scheduled_gates.symbols AND scheduled_gates.accessions @> EXCLUDED.accessions AND scheduled_gates.reasons @> EXCLUDED.reasons THEN 0 ELSE 1 END,
       extracted_at=CASE WHEN EXCLUDED.symbols <@ scheduled_gates.symbols AND scheduled_gates.accessions @> EXCLUDED.accessions AND scheduled_gates.reasons @> EXCLUDED.reasons THEN scheduled_gates.extracted_at ELSE NULL END,
       judged_at=CASE WHEN EXCLUDED.symbols <@ scheduled_gates.symbols AND scheduled_gates.accessions @> EXCLUDED.accessions AND scheduled_gates.reasons @> EXCLUDED.reasons THEN scheduled_gates.judged_at ELSE NULL END,
       detected_at=now()
     RETURNING gate_date::text,symbols,reasons,accessions,revision`,
    [gate.asOf, gate.symbols, JSON.stringify(gate.reasons), JSON.stringify(gate.accessions)],
  );
  const row = result.rows[0];
  return { asOf: row.gate_date, symbols: row.symbols, reasons: row.reasons, accessions: row.accessions, revision: row.revision };
}

export async function unextractedDiscoverySymbols(db: Pick<pg.Pool, "query">): Promise<string[]> {
  const result = await db.query<{ symbol: string }>(`SELECT i.ticker AS symbol FROM instruments i
    JOIN universe_membership m ON m.ticker=i.ticker AND m.list='discovery'
      AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
    WHERE NOT EXISTS (
    SELECT 1 FROM extraction_runs e WHERE e.symbol=i.ticker AND e.status='ok' AND e.applied_at IS NOT NULL)`);
  return result.rows.map((row) => row.symbol);
}

export function parseArgs(args: string[]) {
  let out: string | null = null, since: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) out = args[++i];
    else if (args[i] === "--since" && args[i + 1] && isIsoDate(args[i + 1])) since = args[++i];
    else throw new Error("Usage: detect [--output FILE] [--since YYYY-MM-DD]");
  }
  return { out, since };
}

async function main() {
  const { out, since } = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const filings = await pool.query<Filing>(`SELECT w.symbol,w.accession,w.form,w.items || ',' || COALESCE((
      SELECT substring(d.body from '(?i)Item[[:space:]]+(2[.]02|4[.]02|5[.]02|7[.]01|8[.]01)')
      FROM source_documents d WHERE d.symbol=w.symbol AND d.meta->>'accession'=w.accession
        AND d.doc_type IN ('8-K','8-K/A') LIMIT 1), '') AS items FROM filing_watch w
      WHERE ($1::date IS NULL OR w.filed_at >= $1::date) AND NOT EXISTS (
        SELECT 1 FROM extraction_runs e WHERE e.symbol=w.symbol AND e.status='ok' AND e.applied_at IS NOT NULL AND e.created_at >= w.first_seen_at)`, [since]);
    const docs = await pool.query<{ symbol: string; accession: string; date: string; owner_cik: string | null; trades: InsiderFiling["trades"]; is_new: boolean }>(`SELECT d.symbol,d.meta->>'accession' AS accession,to_char(d.published_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
      d.meta->>'ownerCik' AS owner_cik,d.meta->'trades' AS trades,NOT EXISTS (
        SELECT 1 FROM extraction_runs e WHERE e.symbol=d.symbol AND e.status='ok' AND e.applied_at IS NOT NULL AND d.meta->>'accession'=ANY(e.accessions)) AS is_new
      FROM source_documents d WHERE d.doc_type='4' AND d.published_at >= now() - interval '400 days' AND d.symbol IS NOT NULL`);
    const today = new Date().toISOString().slice(0, 10);
    const bars = await pool.query<{ symbol: string; close: string; high: string; previous: string }>(`WITH ranked AS (
      SELECT ticker,bar_date,close,max(high) OVER (PARTITION BY ticker ORDER BY bar_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) AS high,
        lag(close) OVER (PARTITION BY ticker ORDER BY bar_date) AS previous,
        row_number() OVER (PARTITION BY ticker ORDER BY bar_date DESC) AS rn FROM daily_bars)
      SELECT ticker AS symbol,close::text,high::text,previous::text FROM ranked WHERE rn=1 AND previous IS NOT NULL`);
    const valuations = await pool.query<{ symbol: string; current: string; previous: string }>(`WITH ranked AS (
      SELECT symbol,(value->>'pe')::numeric AS pe,lag((value->>'pe')::numeric) OVER (PARTITION BY symbol ORDER BY as_of) AS previous,
        row_number() OVER (PARTITION BY symbol ORDER BY as_of DESC) AS rn FROM collected_facts WHERE fact_key='valuation_pe')
      SELECT symbol,pe::text AS current,previous::text FROM ranked WHERE rn=1 AND previous IS NOT NULL`);
    const newSymbols = await unextractedDiscoverySymbols(pool);
    const researchDocuments = await pool.query<ResearchDocument>(`SELECT DISTINCT d.symbol,d.id FROM source_documents d
      JOIN research_findings f ON f.symbol=d.symbol
      JOIN LATERAL jsonb_array_elements(f.evidence) AS item(value) ON (item.value->>'documentId')::bigint=d.id
      WHERE d.doc_type='research_page' AND d.symbol IS NOT NULL AND f.verification_status='verified'
        AND item.value->>'status'='verified' AND NOT f.lead
        AND ($1::date IS NULL OR d.published_at >= $1::date)
        AND NOT EXISTS (SELECT 1 FROM extraction_runs e WHERE e.symbol=d.symbol AND e.status='ok'
          AND e.applied_at IS NOT NULL AND e.applied_at >= d.fetched_at)`, [since]);
    const universe = (await loadUniverse(pool)).map((u) => u.symbol);
    const consensus = await pool.query<CatalystConsensus>(`SELECT i.ticker AS symbol, c.as_of::text AS "asOf", c.value
      FROM instruments i LEFT JOIN LATERAL (
        SELECT as_of,value FROM consensus_findings WHERE symbol=i.ticker AND field='productCatalyst'
        ORDER BY as_of DESC LIMIT 1) c ON true WHERE i.ticker = ANY($1::text[])`, [universe]);
    const catalystReviews = catalystReviewSymbols(consensus.rows, today);
    const result = gateSymbols({ filings: filings.rows, insiders: docs.rows.map((r) => ({ symbol: r.symbol, accession: r.accession, date: r.date, ownerCik: r.owner_cik, trades: Array.isArray(r.trades) ? r.trades : [], isNew: r.is_new })),
      drawdowns: bars.rows.flatMap((r) => { const peak = Number(r.high); return peak > 0 ? [{ symbol: r.symbol, current: 100 * (Number(r.close) / peak - 1), previous: 100 * (Number(r.previous) / peak - 1) }] : []; }),
      valuations: valuations.rows.map((r) => ({ symbol: r.symbol, current: Number(r.current), previous: Number(r.previous) })), researchDocuments: researchDocuments.rows, newSymbols, catalystReviews, today }, universe);
    const payload = await persistGate(pool, { asOf: today, ...result, accessions: Object.fromEntries(result.symbols.map((symbol) => [symbol, [...new Set([...filings.rows.filter((f) => f.symbol === symbol && relevantFiling(f)).map((f) => f.accession), ...docs.rows.filter((d) => d.symbol === symbol && d.is_new && d.accession).map((d) => d.accession)])]])) });
    const json = JSON.stringify(payload) + "\n";
    if (out) writeFileSync(out, json);
    process.stdout.write(json);
    return { selected: result.symbols.length, failures: 0 };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])detect\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("detect", main);
