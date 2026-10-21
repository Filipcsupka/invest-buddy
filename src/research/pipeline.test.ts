import {describe,it,expect} from "vitest";
import {decideCandidate,reviewDate,type CandidateInput} from "./pipeline";
const today="2026-10-11";
const fact={id:1,verified:true,confirmed:true,sourceClass:"primary",polarity:"positive",eventDate:"2026-10-10",verifiedAt:"2026-10-11"};
const base=(state:CandidateInput["state"]):CandidateInput=>({symbol:"SMPL",companyName:"Sample",state,stateSince:"2026-10-01",reviewAt:"2026-10-31",scorable:true,inUniverse:true,firstSeenAt:"2026-10-01",quality:"pass",held:false,engineAction:null,engineState:null,findings:[fact],promotionStatus:"none",lastVerifiedAt:null});
describe("research pipeline",()=>{
  it("proposes promotion from one verified primary finding, but not from an aggregator or a name already in the universe",()=>{
    const watch={...base("WATCH"),inUniverse:false};
    expect(decideCandidate({...watch,findings:[{...fact,confirmed:false}]},today).proposePromotion).toBe(true);
    expect(decideCandidate({...watch,findings:[{...fact,sourceClass:"aggregator"}]},today).proposePromotion).toBe(false);
    expect(decideCandidate({...watch,inUniverse:true},today).proposePromotion).toBe(false);
    expect(decideCandidate({...watch,quality:"pending",scorable:false},today).proposePromotion).toBe(false);
  });
  it("keeps a qualified foreign name in unscored WATCH while a US name proposes promotion",()=>{
    const candidate={...base("DISCOVERED"),inUniverse:false,scorable:false,quality:"unknown" as const};
    const foreign=decideCandidate(candidate,today);
    expect(foreign).toMatchObject({state:"WATCH",scorable:false,proposePromotion:false});
    expect(decideCandidate({...candidate,state:"WATCH",held:true,engineAction:"ADD"},today).state).toBe("WATCH");
    const us=decideCandidate({...candidate,quality:"pass",scorable:true},today);
    expect(us).toMatchObject({state:"WATCH",scorable:true,proposePromotion:true});
  });
  it("covers every transition row",()=>{
    const cases:{from:CandidateInput["state"];to:CandidateInput["state"];patch:Partial<CandidateInput>}[]=[
      {from:null,to:"DISCOVERED",patch:{findings:[{...fact,verified:false}]}},
      {from:"DISCOVERED",to:"WATCH",patch:{}},
      {from:"DISCOVERED",to:"DROPPED",patch:{quality:"fail"}},
      {from:"WATCH",to:"START_READY",patch:{engineAction:"START_POSITION"}},
      {from:"WATCH",to:"ADD_READY",patch:{held:true,engineAction:"ADD"}},
      {from:"START_READY",to:"WATCH",patch:{engineAction:"HOLD"}},
      {from:"START_READY",to:"HOLD",patch:{held:true,engineAction:"HOLD"}},
      {from:"START_READY",to:"ADD_READY",patch:{held:true,engineAction:"START_POSITION"}},
      {from:"ADD_READY",to:"HOLD",patch:{held:true,engineAction:"HOLD"}},
      {from:"ADD_READY",to:"HOLD",patch:{held:true,engineAction:"ADD",positionIncreased:true}},
      {from:"ADD_READY",to:"REDUCE",patch:{held:true,engineAction:"REDUCE"}},
      {from:"HOLD",to:"REDUCE",patch:{held:true,engineAction:"REDUCE"}},
      {from:"REDUCE",to:"HOLD",patch:{held:true,engineAction:"HOLD"}},
      {from:"HOLD",to:"WATCH",patch:{held:false}},
      {from:"WATCH",to:"BROKEN",patch:{engineAction:"THESIS_BROKEN"}},
      {from:"BROKEN",to:"WATCH",patch:{stateSince:"2026-10-01",engineState:"Good"}},
      {from:"DROPPED",to:"DISCOVERED",patch:{lastVerifiedAt:"2026-10-01"}},
    ];
    for(const c of cases) expect(decideCandidate({...base(c.from),...c.patch},today).state,`${c.from} -> ${c.to}`).toBe(c.to);
  });
  it("keeps an add signal without a position on WATCH",()=>{
    const d=decideCandidate({...base("WATCH"),held:false,engineAction:"ADD"},today);
    expect(d.state).toBe("WATCH");expect(d.reason).toMatch(/no position/);
  });
  it("uses the earlier review date",()=>{
    expect(reviewDate("HOLD",today,"2026-10-20")).toBe("2026-10-20");
    expect(reviewDate("HOLD",today,"2027-10-20")).toBe("2027-01-09");
  });
  it("never advances a lead to WATCH",()=>{
    const lead={...fact,verified:false,sourceClass:"social"};
    expect(decideCandidate({...base(null),findings:[lead]},today).state).toBe("DISCOVERED");
    expect(decideCandidate({...base("DISCOVERED"),findings:[lead]},today).state).toBe("DISCOVERED");
  });
  it("drops an unverified name after 30 days and advances a negative review",()=>{
    expect(decideCandidate({...base("DISCOVERED"),stateSince:"2026-09-01",findings:[{...fact,verified:false}]},today).state).toBe("DROPPED");
    expect(decideCandidate({...base("WATCH"),inUniverse:false,findings:[{...fact,polarity:"negative"}]},today).reviewAt).toBe(today);
  });
  it("revives a dropped name only on a new verified fact",()=>{
    expect(decideCandidate({...base("DROPPED"),findings:[{...fact,verified:false}]},today).state).toBe("DROPPED");
    expect(decideCandidate({...base("DROPPED"),lastVerifiedAt:"2026-10-01"},today).state).toBe("DISCOVERED");
  });
});
