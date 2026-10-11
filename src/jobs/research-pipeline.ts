import pg from "pg";
import { decideCandidate, type CandidateInput } from "../research/pipeline";
import { appendEvent } from "../db/research";
import { saveDiscoveryPriceBars, screenCandidates, tickerCiks, weekStart, type DiscoveryCandidate } from "./discovery";
import { liquidityReason, loadSecProfile, nameExclusion, profileExclusion } from "./discovery-quality";
import { getText } from "../collectors/http";
import { TwelveDataProvider } from "../data/twelvedata";
import { PostgresUsageLedger } from "../data/usage";
import type { OHLCV } from "../engine/types";

export interface PromotionScreen { score:number; ruleScore:number; ruleState:string; signalDate:string; benchmarkClose:number; sector:string }
/** Insert only a fully screened DS1 row. The owner still runs discovery:promote manually. */
export async function proposePromotion(db:Pick<pg.Pool,"query">, candidate:{symbol:string;companyName:string;themes:string[]}, findings:{id:number;kind:string;evidence:{url:string;status?:string;verificationStatus?:string;verified?:boolean}[]}[], asOf:string, screen:PromotionScreen):Promise<boolean> {
  const sources=findings.flatMap(f=>f.evidence.filter(e=>/^https:\/\//.test(e.url) && (e.verified===true || ["verified","exact","fuzzy","passed"].includes(e.status??"") || ["verified","exact","fuzzy","passed"].includes(e.verificationStatus??""))).map(e=>({kind:"research",url:e.url,detail:f.kind})));
  if(!sources.length) return false;
  const r=await db.query(`INSERT INTO discovery_candidates
    (week_start,symbol,name,sector,theme,score,rule_score,rule_state,signal_date,benchmark_close,sources,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'pending')
    ON CONFLICT (week_start,symbol) DO NOTHING RETURNING symbol`,
  [weekStart(asOf),candidate.symbol,candidate.companyName,screen.sector,candidate.themes[0]??null,screen.score,screen.ruleScore,screen.ruleState,screen.signalDate,screen.benchmarkClose,JSON.stringify(sources)]);
  return !!r.rowCount;
}
type ScreenCheck={quality:"pass"|"fail"|"pending";screen:PromotionScreen|null};
let ciksPromise:Promise<Map<string,number>>|null=null;
async function revenueGrowth(cik:number,today:string):Promise<{current:number;prior:number}|undefined> {
  const raw=JSON.parse(await getText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,"0")}.json`)) as {
    facts?:{"us-gaap"?:Record<string,{units?:{USD?:{frame?:string;end?:string;filed?:string;val?:number}[]}}>}
  };
  for(const concept of ["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax","RevenueFromContractWithCustomerIncludingAssessedTax","SalesRevenueNet"]) {
    const rows=raw.facts?.["us-gaap"]?.[concept]?.units?.USD??[];
    const quarters=new Map<number,{value:number;filed:string}>();
    for(const row of rows) {
      const match=/^CY(\d{4})Q([1-4])$/.exec(row.frame??"");
      if(!match || !row.end || row.end>today || !row.filed || row.filed>today || !Number.isFinite(row.val)) continue;
      const key=Number(match[1])*4+Number(match[2])-1;
      if(!quarters.has(key)||quarters.get(key)!.filed<row.filed) quarters.set(key,{value:row.val!,filed:row.filed});
    }
    for(const key of [...quarters.keys()].sort((a,b)=>b-a)) {
      const now=quarters.get(key)?.value,prev=quarters.get(key-1)?.value,year=quarters.get(key-4)?.value,priorYear=quarters.get(key-5)?.value;
      if(now&&prev&&year&&priorYear) return {current:100*(now/year-1),prior:100*(prev/priorYear-1)};
    }
  }
  return undefined;
}
async function storedScreen(db:Pick<pg.Pool,"query">, symbol:string, name:string, today:string, provider:TwelveDataProvider|null):Promise<ScreenCheck> {
  if(nameExclusion(symbol,name)) return {quality:"fail",screen:null};
  const bars=await db.query<{bar_date:string;open:string;high:string;low:string;close:string;volume:string}>(
    `SELECT bar_date::text,open,high,low,close,volume FROM discovery_price_bars WHERE symbol=$1 AND bar_date<=$2 ORDER BY bar_date DESC LIMIT 240`,[symbol,today]);
  let input:OHLCV[]=bars.rows.reverse().map(b=>({date:b.bar_date,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume)}));
  if(input.length<200 && provider) {
    try {input=await provider.bars(symbol);await saveDiscoveryPriceBars(db,{symbol,name,sector:"Discovery"},input);}
    catch {return {quality:"pending",screen:null};}
  }
  if(input.length<200) return {quality:"pending",screen:null};
  try {
    ciksPromise??=tickerCiks(getText);
    const cik=(await ciksPromise).get(symbol);
    if(!cik) return {quality:"pending",screen:null};
    const profile=await loadSecProfile(cik,getText);
    if(profileExclusion(symbol,profile) || liquidityReason(input,profile.sharesOutstanding)) return {quality:"fail",screen:null};
    const growth=await revenueGrowth(cik,today).catch(()=>undefined);
    const spy=await db.query<{close:string}>("SELECT close FROM daily_bars WHERE ticker='SPY' AND bar_date<=$1 ORDER BY bar_date DESC LIMIT 1",[today]);
    if(!spy.rows[0]) return {quality:"pass",screen:null};
    const row:DiscoveryCandidate={symbol,name,sector:profile.sicDescription??"Discovery",theme:null,score:1,sources:[],growth};
    const screened=await screenCandidates([row],today,async()=>input,{growthSectorRotation:null,dataTailwind:null},Number(spy.rows[0].close));
    const s=screened[0];
    return {quality:"pass",screen:s?.ruleScore!==undefined && s.ruleState && s.signalDate ?
      {score:s.score,ruleScore:s.ruleScore,ruleState:s.ruleState,signalDate:s.signalDate,benchmarkClose:s.benchmarkClose!,sector:s.sector}:null};
  } catch { ciksPromise=null; return {quality:"pending",screen:null}; }
}

export async function runResearchPipeline(pool:pg.Pool,today:string):Promise<{changed:number;proposed:number}> {
  const provider=process.env.TWELVE_DATA_API_KEY ? new TwelveDataProvider({apiKey:process.env.TWELVE_DATA_API_KEY,
    reserve:()=>new PostgresUsageLedger(pool).reserve("twelvedata",1,{job:"discovery",credits:1})}) : null;
  const preflight=await pool.query<{symbol:string;company_name:string}>(`SELECT symbol,company_name FROM (
      SELECT DISTINCT ON (f.symbol) f.symbol,f.company_name,c.last_screened_at
      FROM research_findings f LEFT JOIN research_candidates c ON c.symbol=f.symbol
      WHERE f.verification_status IN ('verified','lead_only')
        AND (c.symbol IS NULL OR c.state='DISCOVERED' OR (c.state='WATCH' AND c.promotion_status='none'))
      ORDER BY f.symbol,f.id DESC
    ) eligible ORDER BY last_screened_at NULLS FIRST,symbol LIMIT 25`);
  const checks=new Map<string,ScreenCheck>();
  for(const row of preflight.rows) checks.set(row.symbol,await storedScreen(pool,row.symbol,row.company_name,today,provider));
  const client=await pool.connect();
  const db=client as unknown as pg.Pool;
  try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('research_pipeline'))");
  const incoming=await db.query<{symbol:string;company_name:string;exchange:string|null;themes:string[];run_id:string;as_of:string;model_output:{candidates:{symbol:string;findingIds:string[];thesis:string;upgradeTriggers:string[];invalidation:string[]}[]};verification_status:string}>(
    `SELECT DISTINCT ON (f.symbol) f.symbol,f.company_name,f.exchange,f.themes,f.run_id,r.as_of::text,r.model_output,f.verification_status
     FROM research_findings f JOIN research_runs r ON r.id=f.run_id
     WHERE f.verification_status IN ('verified','lead_only')
     ORDER BY f.symbol,(f.verification_status='verified') DESC,r.as_of DESC,f.id DESC`);
  for(const f of incoming.rows) {
    const model=f.model_output?.candidates?.find(c=>c.symbol===f.symbol);
    const supported=model?.findingIds?.length ? await db.query<{finding_key:string;verification_status:string}>(
      "SELECT finding_key,verification_status FROM research_findings WHERE run_id=$1 AND finding_key=ANY($2::text[])",[f.run_id,model.findingIds]) : null;
    const safeModel=!!model && !!supported && model.findingIds.every(id=>supported.rows.some(row=>row.finding_key===id && row.verification_status==="verified"));
    const inserted=await db.query(`INSERT INTO research_candidates(symbol,company_name,exchange,themes,state,state_since,review_at,first_run_id,thesis,upgrade_triggers,invalidation)
      VALUES ($1,$2,$3,$4,'DISCOVERED',$5::date,$5::date+14,$6,$7,$8::jsonb,$9::jsonb)
      ON CONFLICT (symbol) DO NOTHING RETURNING symbol`,[f.symbol,f.company_name,f.exchange,f.themes,f.as_of,f.run_id,safeModel?model!.thesis:"",
      JSON.stringify(safeModel?model!.upgradeTriggers:[]),JSON.stringify(safeModel?model!.invalidation:[])]);
    if(inserted.rowCount) await appendEvent(db,{symbol:f.symbol,kind:"discovered",toState:"DISCOVERED",reason:"first verified finding or lead",runId:f.run_id});
    else if(safeModel && model) await db.query(`UPDATE research_candidates SET thesis=$2,upgrade_triggers=$3::jsonb,invalidation=$4::jsonb,
      company_name=$5,exchange=$6,themes=$7,last_checked_at=now() WHERE symbol=$1`,[f.symbol,model.thesis,JSON.stringify(model.upgradeTriggers),
      JSON.stringify(model.invalidation),f.company_name,f.exchange,f.themes]);
  }
  for(const symbol of checks.keys()) await db.query("UPDATE research_candidates SET last_screened_at=now() WHERE symbol=$1",[symbol]);
  const rows=await db.query<{symbol:string;company_name:string;themes:string[];state:CandidateInput["state"];exchange:string|null;state_since:string;review_at:string;first_seen_at:string;last_verified_at:string|null;in_universe:boolean;scorable:boolean;promotion_status:string;owner_note:string|null;last_alert_at:string|null}>(
    `SELECT symbol,company_name,exchange,themes,state,state_since::text,review_at::text,first_seen_at::text,last_verified_at::text,
      in_universe,scorable,promotion_status,owner_note,last_alert_at::text FROM research_candidates ORDER BY symbol`);
  let changed=0,proposed=0;
  for(const c of rows.rows) {
    const fr=await db.query<{id:number;verification_status:string;confirmed:boolean;source_class:string|null;polarity:string;event_date:string|null;verified_at:string|null;kind:string;evidence:{url:string;status?:string;verificationStatus?:string;verified?:boolean}[]}>(
      `SELECT DISTINCT ON (dedupe_key) id,verification_status,confirmed,source_class,polarity,event_date::text,verified_at::text,kind,evidence
       FROM research_findings WHERE symbol=$1 ORDER BY dedupe_key,(verification_status='verified') DESC,verified_at DESC NULLS LAST,id DESC`,[c.symbol]);
    const held=await db.query<{held:boolean}>(`SELECT COALESCE(positions @> $2::jsonb,false) AS held FROM portfolio_baseline WHERE as_of<=$1 ORDER BY as_of DESC LIMIT 1`,[today,JSON.stringify([{symbol:c.symbol}])]);
    let positionIncreased=false;
    if(c.last_alert_at) {
      const baseline=await db.query<{as_of:string;positions:{symbol:string;quantity?:number;valueEur?:number}[]}>(
        "SELECT as_of::text,positions FROM portfolio_baseline WHERE as_of<=$1 ORDER BY as_of DESC LIMIT 1",[today]);
      const current=baseline.rows[0];
      if(current && current.as_of>c.last_alert_at.slice(0,10)) {
        const previous=await db.query<{positions:{symbol:string;quantity?:number;valueEur?:number}[]}>(
          "SELECT positions FROM portfolio_baseline WHERE as_of<=$1::date ORDER BY as_of DESC LIMIT 1",[c.last_alert_at.slice(0,10)]);
        const nowPosition=current.positions.find(p=>p.symbol===c.symbol);
        const oldPosition=previous.rows[0]?.positions.find(p=>p.symbol===c.symbol);
        positionIncreased=!!nowPosition && (!oldPosition || (nowPosition.quantity!==undefined && oldPosition.quantity!==undefined
          ? nowPosition.quantity>oldPosition.quantity : false));
      }
    }
    const member=await db.query("SELECT 1 FROM universe_membership WHERE ticker=$1 AND valid_from<=$2 AND (valid_to IS NULL OR valid_to>$2) LIMIT 1",[c.symbol,today]);
    const signal=await db.query<{action:CandidateInput["engineAction"]}>("SELECT action FROM trade_ideas WHERE symbol=$1 AND as_of<=$2 ORDER BY as_of DESC,id DESC LIMIT 1",[c.symbol,today]);
    const score=await db.query<{state:string}>("SELECT state FROM score_results WHERE ticker=$1 AND as_of<=$2 ORDER BY as_of DESC LIMIT 1",[c.symbol,today]);
    const earnings=await db.query<{report_date:string}>("SELECT report_date::text FROM earnings_calendar_snapshots WHERE ticker=$1 AND report_date>=$2 ORDER BY report_date LIMIT 1",[c.symbol,today]);
    const foreign=!!c.exchange && !["NASDAQ","NYSE","AMEX","NYSEARCA","BATS","CBOE"].includes(c.exchange.toUpperCase());
    const checked=checks.get(c.symbol)??null;
    const screen=checked?.screen??null;
    const quality=foreign?"unknown":nameExclusion(c.symbol,c.company_name)?"fail":checked?.quality==="fail"?"fail":c.scorable?"pass":checked?.quality??"pending";
    const input:CandidateInput={symbol:c.symbol,companyName:c.company_name,state:c.state,stateSince:c.state_since,reviewAt:c.review_at,
      scorable:quality==="pass",inUniverse:!!member.rowCount,firstSeenAt:c.first_seen_at,quality,held:!!held.rows[0]?.held,positionIncreased,
      engineAction:signal.rows[0]?.action??null,engineState:score.rows[0]?.state??null,nextEarningsDate:earnings.rows[0]?.report_date??null,
      findings:fr.rows.map(f=>({id:f.id,verified:f.verification_status==="verified",confirmed:f.confirmed,sourceClass:f.source_class,
        polarity:f.polarity,eventDate:f.event_date,verifiedAt:f.verified_at})),promotionStatus:c.promotion_status,lastVerifiedAt:c.last_verified_at};
    const decision=decideCandidate(input,today);
    if(decision.state && (decision.state!==c.state || decision.reviewAt!==c.review_at || decision.inUniverse!==c.in_universe || decision.scorable!==c.scorable || decision.lastVerifiedAt!==c.last_verified_at)) {
      await db.query(`UPDATE research_candidates SET state=$2,state_since=$3,previous_state=$4,review_at=$5,in_universe=$6,last_verified_at=$7,scorable=$8,promotion_status=CASE WHEN $6 THEN 'approved' ELSE promotion_status END WHERE symbol=$1`,
        [c.symbol,decision.state,decision.stateSince,decision.previousState,decision.reviewAt,decision.inUniverse,decision.lastVerifiedAt,decision.scorable]);
      if(decision.state!==c.state) {await appendEvent(db,{symbol:c.symbol,kind:"state_change",fromState:c.state,toState:decision.state,reason:decision.reason});changed++;}
      if(decision.inUniverse&&!c.in_universe) await appendEvent(db,{symbol:c.symbol,kind:"promoted",reason:"entered universe"});
    }
    if(decision.reviewDue) {
      const already=await db.query("SELECT 1 FROM research_events WHERE symbol=$1 AND kind='review_due' AND at::date=$2::date LIMIT 1",[c.symbol,today]);
      if(!already.rowCount) await appendEvent(db,{symbol:c.symbol,kind:"review_due",reason:"scheduled review due"});
    }
    if(decision.proposePromotion) {
      if(screen && await proposePromotion(db,{symbol:c.symbol,companyName:c.company_name,themes:c.themes},fr.rows.filter(f=>f.verification_status==="verified"),today,screen)) {
        await db.query("UPDATE research_candidates SET promotion_status='proposed' WHERE symbol=$1",[c.symbol]);
        await appendEvent(db,{symbol:c.symbol,kind:"promotion_proposed",reason:"DS1 screen passed",findingIds:fr.rows.filter(f=>f.verification_status==="verified").map(f=>f.id)}); proposed++;
      }
    }
  }
  await client.query("COMMIT");
  return {changed,proposed};
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}
if (/(?:^|[/\\])research-pipeline\.(?:ts|js)$/.test(process.argv[1]??"")) {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  runResearchPipeline(pool,new Date().toISOString().slice(0,10)).then(r=>process.stdout.write(JSON.stringify(r)+"\n"))
    .catch(e=>{console.error(e);process.exitCode=1}).finally(()=>pool.end());
}
