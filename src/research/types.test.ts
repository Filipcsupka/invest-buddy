import { describe, expect, it } from "vitest";
import sample from "./fixtures/sample-output.json";
import {
  ADAPTERS, AUTH_SOURCES, CHAIN_OUTCOMES, CHAIN_RELATIONS, CONFIDENCES, FINDING_KINDS, POLARITIES, RUN_STATUSES, RUN_TYPES, SCORE_FIELDS,
  MACRO_RELEASES, MACRO_SYMBOL, SOURCE_CLASSES, SUPPORTED_KEYWORDS, isResearchOutput, numberTokens, researchSchema, schemaErrors, validateResearchOutput,
  type JsonSchema, type ResearchOutput,
} from "./types";

const fresh = (): ResearchOutput => structuredClone(sample) as unknown as ResearchOutput;
const macroFinding = () => ({
  id: "f90", symbol: MACRO_SYMBOL, companyName: "CPI", exchange: null, kind: "macro_release" as const, field: null,
  polarity: "neutral" as const, claim: "September CPI rose 0.4% against a 0.3% consensus.", eventDate: "2026-10-09", themes: [],
  evidence: [{
    url: "https://example.com/news/2026-10-09-cpi", sourceName: "Example Wire (fixture)", sourceClassHint: "press" as const, publishedAt: "2026-10-09",
    quote: "Consumer prices rose 0.4% in September after 0.2% in August, above the 0.3% increase economists had expected.",
  }],
  figures: [
    { label: "consensus", value: "0.3%", evidenceIndex: 0 },
    { label: "actual", value: "0.4%", evidenceIndex: 0 },
    { label: "prior", value: "0.2%", evidenceIndex: 0 },
  ],
  confidence: "medium" as const, lead: false,
});
const withMacro = (change: (f: ReturnType<typeof macroFinding>, o: ResearchOutput) => void = () => {}): ResearchOutput => {
  const o = fresh();
  const f = macroFinding();
  change(f, o);
  o.output.findings.push(f as unknown as ResearchOutput["output"]["findings"][number]);
  return o;
};
const defs = researchSchema.$defs as Record<string, JsonSchema>;
const prop = (def: string, name: string) => (defs[def].properties as Record<string, JsonSchema>)[name];

describe("research output schema", () => {
  it("accepts the sample fixture", () => {
    expect(validateResearchOutput(sample)).toEqual([]);
    expect(isResearchOutput(sample)).toBe(true);
  });

  it("uses only keywords the walker understands", () => {
    const seen = new Set<string>();
    const visit = (node: JsonSchema) => {
      for (const key of Object.keys(node)) seen.add(key);
      for (const child of Object.values(node.$defs ?? {})) visit(child);
      for (const child of Object.values(node.properties ?? {})) visit(child);
      if (node.items) visit(node.items);
    };
    visit(researchSchema);
    expect([...seen].filter((key) => !SUPPORTED_KEYWORDS.includes(key))).toEqual([]);
  });

  it("keeps the schema enums and the TypeScript constants in step", () => {
    const run = prop("run", "adapter").properties as Record<string, JsonSchema>;
    expect(prop("run", "runType").enum).toEqual([...RUN_TYPES]);
    expect(prop("run", "status").enum).toEqual([...RUN_STATUSES]);
    expect(run.name.enum).toEqual([...ADAPTERS]);
    expect(run.authSource.enum).toEqual([...AUTH_SOURCES]);
    expect(prop("finding", "kind").enum).toEqual([...FINDING_KINDS]);
    expect(prop("finding", "field").enum).toEqual([...SCORE_FIELDS, null]);
    expect(prop("finding", "polarity").enum).toEqual([...POLARITIES]);
    expect(prop("finding", "confidence").enum).toEqual([...CONFIDENCES]);
    expect(prop("evidence", "sourceClassHint").enum).toEqual([...SOURCE_CLASSES]);
    expect(prop("chainLink", "relation").enum).toEqual([...CHAIN_RELATIONS]);
    expect(prop("chainLink", "outcome").enum).toEqual([...CHAIN_OUTCOMES]);
  });

  it("rejects a non-object and a wrong schema version", () => {
    expect(validateResearchOutput(null)).toEqual(["$: expected object, got null"]);
    const o = fresh() as unknown as Record<string, unknown>;
    o.schemaVersion = 2;
    expect(validateResearchOutput(o)).toContain("$.schemaVersion: must equal 1");
  });

  it("has no place for points, ratings, actions or amounts", () => {
    const o = fresh();
    Object.assign(o.output.findings[0], { points: 3 });
    Object.assign(o.output.candidates[0], { action: "START_POSITION", amountEur: 50 });
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.output.findings[0].points: unknown field");
    expect(errs).toContain("$.output.candidates[0].action: unknown field");
    expect(errs).toContain("$.output.candidates[0].amountEur: unknown field");
  });

  it("needs at least one https evidence item with a real quote", () => {
    const o = fresh();
    o.output.findings[0].evidence = [];
    expect(validateResearchOutput(o)).toContain("$.output.findings[0].evidence: fewer than 1 items");
    const p = fresh();
    p.output.findings[0].evidence[0].url = "http://example.com/ir";
    p.output.findings[0].evidence[0].quote = "too short";
    const errs = validateResearchOutput(p);
    expect(errs.some((e) => e.startsWith("$.output.findings[0].evidence[0].url: does not match"))).toBe(true);
    expect(errs).toContain("$.output.findings[0].evidence[0].quote: shorter than 20");
  });

  it("checks dates, uuids and integers", () => {
    const o = fresh();
    o.run.asOf = "2026-02-30";
    o.run.runId = "not-a-uuid";
    o.run.limits.maxTurns = 2.5;
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.run.asOf: not a valid date");
    expect(errs).toContain("$.run.runId: not a valid uuid");
    expect(errs).toContain("$.run.limits.maxTurns: expected integer, got number");
  });

  it("rejects duplicate ids and references to unknown findings", () => {
    const o = fresh();
    o.output.findings[1].id = "f1";
    o.output.candidates[0].card.whatHappened[0].findingIds = ["f9"];
    o.output.chains[0].developmentFindingId = "f8";
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.output.findings[1].id: duplicate f1");
    expect(errs).toContain("$.output.candidates[0].card line 0 findingIds[0]: unknown finding f9");
    expect(errs).toContain("$.output.chains[0].developmentFindingId: unknown finding f8");
  });

  it("needs a candidate finding about the candidate itself", () => {
    const o = fresh();
    o.output.candidates[0].findingIds = ["f3"];
    expect(validateResearchOutput(o)).toContain("$.output.candidates[0].findingIds: no finding about SMPL");
  });

  it("accepts a figure only when its numbers are in the cited quote", () => {
    expect(numberTokens("USD 1,250M")).toEqual(["1250"]);
    expect(numberTokens("$1,250,000 and 0.49")).toEqual(["1250000", "0.49"]);
    const o = fresh();
    o.output.findings[0].figures[0].value = "USD 1,300M";
    o.output.findings[1].figures[0].evidenceIndex = 2;
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.output.findings[0].figures[0].value: 1300 not in the quote of evidence 0");
    expect(errs).toContain("$.output.findings[1].figures[0].evidenceIndex: no evidence item 2");
    const p = fresh();
    p.output.findings[0].figures[0].value = "large";
    expect(validateResearchOutput(p)).toContain("$.output.findings[0].figures[0].value: has no number");
  });

  it("treats social-only findings as leads that never feed a score input", () => {
    const o = fresh();
    o.output.findings[2].evidence[0].sourceClassHint = "social";
    expect(validateResearchOutput(o)).toContain("$.output.findings[2].lead: a finding with only social sources must be a lead");
    const p = fresh();
    p.output.findings[0].lead = true;
    const errs = validateResearchOutput(p);
    expect(errs).toContain("$.output.findings[0].field: a lead never feeds a score input");
  });

  it("does not let leads alone carry a candidate or a chain link", () => {
    const o = fresh();
    for (const f of o.output.findings) { f.lead = true; f.field = null; }
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.output.candidates[0].findingIds: a candidate needs at least one finding that is not a lead");
    expect(errs).toContain("$.output.chains[0].links[0]: a relationship needs a finding that is not a lead");
  });

  it("matches the score field to the kind and polarity", () => {
    const o = fresh();
    o.output.findings[0].field = "guidanceRaised";
    o.output.findings[1].field = "guidanceCut";
    const errs = validateResearchOutput(o);
    expect(errs).toContain("$.output.findings[0].field: guidanceRaised does not fit kind contract");
    expect(errs).toContain("$.output.findings[1].polarity: guidanceCut needs negative");
  });

  it("rejects evidence published after the run date", () => {
    const o = fresh();
    o.output.findings[0].evidence[0].publishedAt = "2026-10-12";
    expect(validateResearchOutput(o)).toContain("$.output.findings[0].evidence[0].publishedAt: after the run date 2026-10-11");
  });

  it("ties the deep dive symbol to the run type", () => {
    const o = fresh();
    o.run.runType = "deep_dive";
    expect(validateResearchOutput(o)).toContain("$.run.scope.deepDiveSymbol: required for a deep_dive run");
    o.run.scope.deepDiveSymbol = "SMPL";
    expect(validateResearchOutput(o)).toEqual([]);
    const p = fresh();
    p.run.scope.deepDiveSymbol = "SMPL";
    expect(validateResearchOutput(p)).toContain("$.run.scope.deepDiveSymbol: only a deep_dive run names one");
    const q = fresh();
    q.run.scope.themes = [];
    expect(validateResearchOutput(q)).toContain("$.run.scope.themes: a weekly_discovery run needs at least one theme");
  });

  it("enforces the run's finding limit", () => {
    const o = fresh();
    o.run.limits.maxFindings = 2;
    expect(validateResearchOutput(o)).toContain("$.output.findings: 3 findings over the run limit 2");
  });

  it("rejects advice, action and score wording in model text", () => {
    const o = fresh();
    o.output.findings[0].claim = "Investors should start a position before earnings.";
    o.output.candidates[0].card.verdict = "Moves to START_READY.";
    o.output.candidates[0].thesis = "Scores 19 of 25 points on the rules.";
    const errs = validateResearchOutput(o);
    expect(errs).toContain('$.output.findings[0].claim: advice or score wording "start a position"');
    expect(errs).toContain('$.output.candidates[0].card.verdict: advice or score wording "START_READY"');
    expect(errs).toContain('$.output.candidates[0].thesis: advice or score wording "19 of 25 points"');
  });

  it("allows plain facts that contain trading verbs in another sense", () => {
    const o = fresh();
    o.output.findings[2].claim = "Example Robotics agreed to acquire a sensor maker and announced a share buyback for fiscal 2026/27.";
    expect(validateResearchOutput(o)).toEqual([]);
  });

  it("reports only shape errors when the shape is wrong", () => {
    const o = fresh() as unknown as { output: { findings: unknown } };
    o.output.findings = "none";
    expect(schemaErrors(o)).toEqual(["$.output.findings: expected array, got string"]);
    expect(validateResearchOutput(o)).toEqual(["$.output.findings: expected array, got string"]);
  });
});

describe("macro_release findings (P9)", () => {
  it("accepts a release with a quoted consensus and actual", () => {
    expect(validateResearchOutput(withMacro())).toEqual([]);
    expect(MACRO_RELEASES).toContain("FOMC rate decision");
  });

  it("needs exactly one consensus and one actual figure", () => {
    const errs = validateResearchOutput(withMacro((f) => { f.figures = f.figures.filter((g) => g.label !== "consensus"); }));
    expect(errs).toContain("$.output.findings[3].figures: needs exactly one consensus figure");
    const twice = validateResearchOutput(withMacro((f) => { f.figures.push({ label: "actual", value: "0.4%", evidenceIndex: 0 }); }));
    expect(twice).toContain("$.output.findings[3].figures: needs exactly one actual figure");
    const label = validateResearchOutput(withMacro((f) => { f.figures[2].label = "forecast"; }));
    expect(label).toContain("$.output.findings[3].figures[2].label: must be one of consensus, actual, prior");
  });

  it("rejects a value that is not in every quote", () => {
    const assumed = validateResearchOutput(withMacro((f) => { f.figures[0].value = "0.5%"; }));
    expect(assumed).toContain("$.output.findings[3].evidence[0].quote: consensus 0.5 not in this quote");
    const second = validateResearchOutput(withMacro((f) => {
      f.evidence.push({ ...f.evidence[0], url: "https://example.org/cpi", quote: "The Labor Department said consumer prices rose 0.4% in September." });
    }));
    expect(second).toEqual(["$.output.findings[3].evidence[1].quote: consensus 0.3 not in this quote"]);
  });

  it("keeps a release out of scoring, candidates and chains", () => {
    const errs = validateResearchOutput(withMacro((f, o) => {
      Object.assign(f, { field: "narrativeChanged", polarity: "positive", exchange: "NYSE" });
      o.output.candidates[0].findingIds.push("f90");
      o.output.chains[0].links[0].findingIds.push("f90");
    }));
    expect(errs).toContain("$.output.findings[3].field: a macro_release finding never feeds a score input");
    expect(errs).toContain("$.output.findings[3].polarity: a macro_release finding is neutral");
    expect(errs).toContain("$.output.findings[3].exchange: a macro_release finding has none");
    expect(errs.some((e) => e.endsWith("macro_release finding f90 is owner context only and cannot be cited"))).toBe(true);
    expect(errs.filter((e) => e.includes("cannot be cited"))).toHaveLength(2);
  });

  it("ties the reserved symbol, the release name and the release date to the kind", () => {
    const errs = validateResearchOutput(withMacro((f) => { Object.assign(f, { symbol: "SMPL", companyName: "Inflation", eventDate: null }); }));
    expect(errs).toContain("$.output.findings[3].symbol: a macro_release finding uses MACRO");
    expect(errs.some((e) => e.startsWith("$.output.findings[3].companyName: must name a release"))).toBe(true);
    expect(errs).toContain("$.output.findings[3].eventDate: the release date is required");
    expect(validateResearchOutput(withMacro((f) => { f.eventDate = "2026-10-14"; })))
      .toContain("$.output.findings[3].eventDate: release after the run date 2026-10-11");
    const o = fresh();
    o.output.findings[0].symbol = MACRO_SYMBOL;
    expect(validateResearchOutput(o)).toContain("$.output.findings[0].symbol: MACRO is reserved for macro_release findings");
  });
});
