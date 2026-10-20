import type { PipelineState } from "./types";

export interface CandidateInput {
  symbol: string; companyName: string; state: PipelineState | null; stateSince: string | null; reviewAt: string | null;
  scorable: boolean; inUniverse: boolean; firstSeenAt: string | null; ownerBroken?: boolean; nextEarningsDate?: string | null;
  quality: "pass" | "fail" | "unknown" | "pending"; held: boolean; positionIncreased?: boolean;
  engineAction?: "WATCH" | "START_POSITION" | "ADD" | "HIGH_CONVICTION_ADD" | "HOLD" | "REDUCE" | "THESIS_BROKEN" | null;
  engineState?: string | null;
  findings: { id: number; verified: boolean; confirmed: boolean; sourceClass: string | null; polarity: string; eventDate: string | null; verifiedAt: string | null }[];
  promotionStatus: string; lastVerifiedAt: string | null;
}
export interface PipelineDecision { symbol: string; state: PipelineState | null; previousState: PipelineState | null; stateSince: string | null; reviewAt: string | null; reason: string | null; reviewDue: boolean; inUniverse: boolean; scorable: boolean; proposePromotion: boolean; lastVerifiedAt: string | null }
export const REVIEW_DAYS: Record<PipelineState,number> = { DISCOVERED:14,WATCH:30,START_READY:7,ADD_READY:7,HOLD:90,REDUCE:7,BROKEN:90,DROPPED:180 };
const day = (value: string) => new Date(`${value}T00:00:00Z`);
export function reviewDate(state: PipelineState, since: string, nextEarnings?: string | null): string {
  const date = day(since); date.setUTCDate(date.getUTCDate()+REVIEW_DAYS[state]);
  const interval = date.toISOString().slice(0,10);
  return nextEarnings && nextEarnings >= since && nextEarnings < interval ? nextEarnings : interval;
}

/** One deterministic pass over a candidate. Only verified facts and the deterministic engine can advance a state. */
export function decideCandidate(c: CandidateInput, today: string): PipelineDecision {
  const verified = c.findings.filter(f=>f.verified);
  const latest = verified.map(f=>f.verifiedAt).filter((v):v is string=>!!v).sort().at(-1) ?? c.lastVerifiedAt;
  const fresh = verified.some(f=>!c.lastVerifiedAt || (f.verifiedAt??"")>c.lastVerifiedAt);
  const positiveAfterBreak = verified.some(f=>f.polarity==="positive" && !!f.eventDate && !!c.stateSince && f.eventDate>c.stateSince);
  const hasQualified = verified.some(f=>f.sourceClass==="primary"||f.sourceClass==="press");
  const buy = ["START_POSITION","ADD","HIGH_CONVICTION_ADD"].includes(c.engineAction??"");
  const broken = c.ownerBroken || c.engineAction==="THESIS_BROKEN" || c.engineState==="Criteria broken";
  let state = c.state;
  let reason: string | null = null;
  const move = (to: PipelineState, why: string) => { state=to; reason=why; };
  if (!state && c.findings.length) move("DISCOVERED","first finding");
  else if (state==="DROPPED" && fresh) move("DISCOVERED","new verified finding");
  else if (state && state!=="DROPPED" && broken) move("BROKEN","thesis broken");
  else if (state==="BROKEN" && c.engineState!=="Criteria broken" && positiveAfterBreak) move("WATCH","verified positive finding after break");
  else if (state==="DISCOVERED") {
    if (c.quality==="fail") move("DROPPED","quality filter failed");
    else if (hasQualified && c.quality!=="pending") move("WATCH","verified primary or press finding");
    else if (!verified.length && c.stateSince && day(today).getTime()-day(c.stateSince).getTime()>=30*86400000) move("DROPPED","no verified finding in 30 days");
  } else if (state==="WATCH") {
    if (c.inUniverse && !c.held && c.engineAction==="START_POSITION") move("START_READY","start signal without position");
    else if (c.held && buy) move("ADD_READY","buy signal with position");
    else if (!c.held && (c.engineAction==="ADD"||c.engineAction==="HIGH_CONVICTION_ADD")) reason="add-level signal, no position";
  } else if (state==="START_READY") {
    if (c.held && buy) move("ADD_READY","position opened with buy signal");
    else if (c.held) move("HOLD","position opened");
    else if (!buy) move("WATCH","buy signal ended");
  } else if (state==="ADD_READY") {
    if (c.held && c.positionIncreased) move("HOLD","position increased after alert");
    else if (!c.held) move("WATCH","position closed");
    else if (c.engineAction==="REDUCE") move("REDUCE","reduce signal");
    else if (!buy) move("HOLD","buy signal ended");
  } else if (state==="HOLD") {
    if (!c.held) move("WATCH","position closed");
    else if (c.engineAction==="REDUCE") move("REDUCE","reduce signal");
    else if (buy) move("ADD_READY","buy signal with position");
  } else if (state==="REDUCE") {
    if (!c.held) move("WATCH","position closed");
    else if (c.engineAction!=="REDUCE") move("HOLD","reduce signal ended");
  }
  const entered = state!==c.state;
  const since = state ? (entered ? today : c.stateSince??today) : null;
  let reviewAt = state ? (entered || !c.reviewAt ? reviewDate(state,since!,c.nextEarningsDate) : c.reviewAt) : null;
  if (state && !c.inUniverse && verified.some(f=>f.polarity==="negative" && fresh)) reviewAt=today;
  const scorable = c.quality==="pass" && c.scorable;
  return { symbol:c.symbol,state,previousState:entered?c.state:null,stateSince:since,reviewAt,reason,reviewDue:!!reviewAt&&reviewAt<=today,
    inUniverse:c.inUniverse,scorable,proposePromotion:state==="WATCH" && scorable && !c.inUniverse && c.promotionStatus==="none" && hasQualified,lastVerifiedAt:latest };
}
export function decidePipeline(candidates: CandidateInput[], today: string): PipelineDecision[] { return candidates.map(c=>decideCandidate(c,today)); }
