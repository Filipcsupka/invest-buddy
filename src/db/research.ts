import { createHash } from "node:crypto";
import type pg from "pg";
import type { ResearchOutput, VerificationStatus, PipelineState } from "../research/types";

export type Db = Pick<pg.Pool, "query" | "connect">;
export const dedupeKey = (f: ResearchOutput["output"]["findings"][number]) =>
  `${f.symbol}|${f.kind}|${f.eventDate ?? ""}|${createHash("sha256").update(f.claim.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")).digest("hex")}`;

/** One atomic insert. A UUID replay is a no-op even when a later request carries different text. */
export async function insertResearchOutput(db: Db, output: ResearchOutput): Promise<{ replayed: boolean; findings: number }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { run } = output;
    const inserted = await client.query(`INSERT INTO research_runs
      (id,run_type,as_of,started_at,finished_at,adapter,model,auth_source,prompt_version,status,stop_reason,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,web_searches,web_fetches,cost_usd,duration_s,findings_count,output_hash,model_output)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
      ON CONFLICT (id) DO NOTHING RETURNING id`, [run.runId, run.runType, run.asOf, run.generatedAt, run.generatedAt,
      run.adapter.name, run.adapter.model, run.adapter.authSource, run.promptVersion, run.status, run.stopReason,
      run.usage.inputTokens, run.usage.outputTokens, run.usage.cacheReadTokens, run.usage.cacheCreationTokens,
      run.usage.webSearches, run.usage.webFetches, run.usage.costUsd, run.usage.durationS, output.output.findings.length,
      createHash("sha256").update(JSON.stringify(output)).digest("hex"),JSON.stringify(output.output)]);
    if (!inserted.rowCount) { await client.query("COMMIT"); return { replayed: true, findings: 0 }; }
    for (const f of output.output.findings) await client.query(`INSERT INTO research_findings
      (run_id,finding_key,symbol,company_name,exchange,kind,field,polarity,claim,event_date,themes,confidence,lead,evidence,figures,dedupe_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)`,
    [run.runId,f.id,f.symbol,f.companyName,f.exchange,f.kind,f.field,f.polarity,f.claim,f.eventDate,f.themes,f.confidence,f.lead,
      JSON.stringify(f.evidence),JSON.stringify(f.figures),dedupeKey(f)]);
    await client.query("COMMIT");
    return { replayed: false, findings: output.output.findings.length };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function insertSkippedRun(db: Db, skip: { runId: string; runType: string; asOf: string; status: string; stopReason: string; adapter: string }): Promise<{ replayed: boolean }> {
  const r = await db.query(`INSERT INTO research_runs(id,run_type,as_of,adapter,status,stop_reason)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`, [skip.runId,skip.runType,skip.asOf,skip.adapter,skip.status,skip.stopReason]);
  return { replayed: !r.rowCount };
}

export interface FindingRow { id: number; run_id: string; symbol: string; company_name: string; kind: string; polarity: string; claim: string; event_date: string | null; evidence: ResearchOutput["output"]["findings"][number]["evidence"]; verification_status: VerificationStatus; source_class: string | null; confirmed: boolean; lead: boolean; dedupe_key: string; verified_at: string | null }
export async function pendingFindings(db: Pick<pg.Pool,"query">, limit = 100): Promise<FindingRow[]> {
  const r = await db.query<FindingRow>("SELECT * FROM research_findings WHERE verification_status='pending' ORDER BY id LIMIT $1", [limit]);
  return r.rows;
}
export async function writeVerification(db: Pick<pg.Pool,"query">, id: number, result: { status: VerificationStatus; evidence: unknown[]; sourceClass?: string | null; sourceId?: string | null; snapshotId?: number | null; documentId?: number | null; confirmed?: boolean; readingLabel?: string | null; displayQuote?: boolean }): Promise<void> {
  await db.query(`WITH updated AS (
    UPDATE research_findings SET verification_status=$2,evidence=$3::jsonb,source_class=$4,source_id=$5,snapshot_id=$6,document_id=$7,
      confirmed=$8,reading_label=$9,display_quote=$10,verified_at=now() WHERE id=$1 AND verification_status='pending'
      RETURNING id,symbol,run_id,dedupe_key,verification_status
    )
    INSERT INTO research_events(symbol,kind,reason,finding_ids,run_id)
    SELECT u.symbol,CASE WHEN u.verification_status='verified' THEN 'finding_verified' ELSE 'finding_dropped' END,
      u.verification_status,ARRAY[u.id],u.run_id FROM updated u
    WHERE NOT EXISTS (SELECT 1 FROM research_findings f WHERE f.dedupe_key=u.dedupe_key AND f.id<>u.id AND f.verification_status=u.verification_status)`,
  [id,result.status,JSON.stringify(result.evidence),result.sourceClass??null,result.sourceId??null,result.snapshotId??null,result.documentId??null,result.confirmed??false,result.readingLabel??null,result.displayQuote??false]);
}

export interface CandidateRow {
  symbol:string;companyName:string;exchange:string|null;themes:string[];state:PipelineState;stateSince:string;reviewAt:string;
  firstRunId:string|null;lastVerifiedAt:string|null;lastCheckedAt:string|null;inUniverse:boolean;scorable:boolean;
  promotionStatus:string;previousState:PipelineState|null;ownerNote:string|null;thesis:string;upgradeTriggers:string[];invalidation:string[];
}
export async function readCandidates(db: Pick<pg.Pool,"query">): Promise<CandidateRow[]> {
  const r = await db.query<CandidateRow>(`SELECT symbol,company_name AS "companyName",exchange,themes,state,state_since::text AS "stateSince",
    review_at::text AS "reviewAt",first_run_id AS "firstRunId",last_verified_at::text AS "lastVerifiedAt",
    last_checked_at::text AS "lastCheckedAt",in_universe AS "inUniverse",scorable,promotion_status AS "promotionStatus",
    previous_state AS "previousState",owner_note AS "ownerNote",thesis,upgrade_triggers AS "upgradeTriggers",invalidation
    FROM research_candidates ORDER BY symbol`); return r.rows;
}
export async function writeCandidate(db: Pick<pg.Pool,"query">, row: CandidateRow): Promise<void> {
  await db.query(`UPDATE research_candidates SET state=$2,state_since=$3,previous_state=$4,review_at=$5,
    in_universe=$6,scorable=$7,promotion_status=$8,last_verified_at=$9,owner_note=$10 WHERE symbol=$1`,
  [row.symbol,row.state,row.stateSince,row.previousState,row.reviewAt,row.inUniverse,row.scorable,row.promotionStatus,row.lastVerifiedAt,row.ownerNote]);
}
export async function appendEvent(db: Pick<pg.Pool,"query">, event: { symbol: string; kind: string; fromState?: string | null; toState?: string | null; reason?: string | null; findingIds?: number[]; runId?: string | null; payload?: unknown }): Promise<void> {
  await db.query(`INSERT INTO research_events(symbol,kind,from_state,to_state,reason,finding_ids,run_id,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [event.symbol,event.kind,event.fromState??null,event.toState??null,event.reason??null,event.findingIds??[],event.runId??null,JSON.stringify(event.payload??{})]);
}

/** Private runner input. Projection deliberately excludes position quantities and EUR values. */
export async function researchInput(db: Pick<pg.Pool,"query">, type: "daily"|"weekly"|"deepdive", symbol?: string, asOf = new Date().toISOString().slice(0,10)) {
  const baseline = await db.query<{positions:{symbol:string}[]}>("SELECT positions FROM portfolio_baseline WHERE as_of<=$1 ORDER BY as_of DESC LIMIT 1",[asOf]);
  const positions = [...new Set((baseline.rows[0]?.positions??[]).map(p=>p.symbol))];
  const candidates = (await db.query<{symbol:string;state:string;thesis:string;review_at:string;last_checked_at:string}>(
    "SELECT symbol,state,thesis,review_at::text,last_checked_at::text FROM research_candidates WHERE state<>'DROPPED' ORDER BY symbol")).rows;
  const names: string[]=[];
  const triggerMap=new Map<string,string[]>();
  const add=(s:string)=>{if(s && !names.includes(s) && names.length<25) names.push(s);};
  if(type==="deepdive") { if(symbol) add(symbol); }
  else if(type==="daily") {
    positions.forEach(add);
    candidates.filter(c=>["START_READY","ADD_READY","HOLD","REDUCE"].includes(c.state)).forEach(c=>{
      add(c.symbol);triggerMap.set(c.symbol,[...(triggerMap.get(c.symbol)??[]),`pipeline_state:${c.state}`]);
    });
    candidates.filter(c=>c.review_at<=asOf).forEach(c=>{
      add(c.symbol);triggerMap.set(c.symbol,[...(triggerMap.get(c.symbol)??[]),"review_due"]);
    });
    const triggers=await db.query<{symbol:string;reason:string}>(`SELECT symbol,'filing' AS reason FROM filing_watch
        WHERE first_seen_at::date > COALESCE((SELECT max(as_of) FROM research_runs WHERE run_type='daily_watch' AND as_of<$1),$1::date-2)
      UNION ALL SELECT ticker AS symbol,'earnings' AS reason FROM earnings_calendar_snapshots WHERE report_date BETWEEN $1::date-2 AND $1::date
      UNION ALL SELECT b.ticker AS symbol,'price_move' AS reason FROM daily_bars b JOIN LATERAL
        (SELECT close FROM daily_bars p WHERE p.ticker=b.ticker AND p.bar_date<b.bar_date ORDER BY p.bar_date DESC LIMIT 1) p ON true
        WHERE b.bar_date=$1 AND abs(b.close/p.close-1)>=0.07
      UNION ALL SELECT b.ticker AS symbol,'volume_spike' AS reason FROM daily_bars b JOIN LATERAL
        (SELECT avg(volume) AS avg_volume,count(*) AS n FROM (SELECT volume FROM daily_bars p WHERE p.ticker=b.ticker AND p.bar_date<b.bar_date ORDER BY p.bar_date DESC LIMIT 20) prior) v ON true
        WHERE b.bar_date=$1 AND v.n=20 AND b.volume>=v.avg_volume*2.5
      ORDER BY symbol`,[asOf]);
    triggers.rows.forEach(t=>{add(t.symbol);triggerMap.set(t.symbol,[...(triggerMap.get(t.symbol)??[]),t.reason]);});
    candidates.filter(c=>c.state==="WATCH").sort((a,b)=>(a.last_checked_at??"").localeCompare(b.last_checked_at??"")).forEach(c=>add(c.symbol));
  }
  const findings=names.length ? (await db.query<{symbol:string;claim:string;kind:string;event_date:string|null;confirmed:boolean;evidence:unknown}>(
    `SELECT DISTINCT ON (symbol,dedupe_key) symbol,claim,kind,event_date::text,confirmed,evidence FROM research_findings
     WHERE verification_status='verified' AND verified_at>=$1::date-90 AND symbol=ANY($2::text[])
     ORDER BY symbol,dedupe_key,verified_at DESC`,[asOf,names])).rows : [];
  const themeCandidates=candidates.map(c=>({symbol:c.symbol,state:c.state,thesis:c.thesis}));
  return {type,asOf,symbols:names,positions:positions.filter(s=>names.includes(s)),candidates:themeCandidates,
    perSymbol:names.map(s=>({symbol:s,triggers:triggerMap.get(s)??[],verifiedClaims:findings.filter(f=>f.symbol===s).map(f=>({claim:f.claim,kind:f.kind,eventDate:f.event_date,confirmed:f.confirmed}))})),
    themes:["ai_compute","datacenter_power","cloud_data","cyber","robotics","autonomy","biotech_medtech","fintech","energy_grid","space","defense_tech","advanced_manufacturing","new_themes"],limits:{maxSymbols:25,maxFindings:60}};
}
