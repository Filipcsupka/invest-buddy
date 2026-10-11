import { describe, expect, it } from "vitest";
import sample from "./fixtures/sample-output.json";
import {
  ADAPTERS, AUTH_SOURCES, CHAIN_OUTCOMES, CHAIN_RELATIONS, CONFIDENCES, FINDING_KINDS, POLARITIES, RUN_STATUSES, RUN_TYPES, SCORE_FIELDS,
  SOURCE_CLASSES, SUPPORTED_KEYWORDS, isResearchOutput, numberTokens, researchSchema, schemaErrors, validateResearchOutput,
  type JsonSchema, type ResearchOutput,
} from "./types";

const fresh = (): ResearchOutput => structuredClone(sample) as unknown as ResearchOutput;
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
