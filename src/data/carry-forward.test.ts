import { describe, expect, it } from "vitest";
import { ageDays, basisDate, carryField, carryForwardEnabled, carryState, type ConsensusRow } from "./carry-forward";

const row = (over: Partial<ConsensusRow> & { field: string }): ConsensusRow & { symbol: string } => ({
  symbol: "AMD", as_of: "2026-09-20", value: true, agreement: "agree", agent_values: { claude: { value: true, runId: "c1" }, codex: { value: true, runId: "x1" } },
  evidence_refs: [], verified: true, reason: "Both agents agree and supporting evidence passed", carried_from: null, ...over,
});

describe("carry-forward windows", () => {
  it("is off unless CARRY_FORWARD=on", () => {
    expect(carryForwardEnabled({})).toBe(false);
    expect(carryForwardEnabled({ CARRY_FORWARD: "off" })).toBe(false);
    expect(carryForwardEnabled({ CARRY_FORWARD: "1" })).toBe(false);
    expect(carryForwardEnabled({ CARRY_FORWARD: "on" })).toBe(true);
  });
  it("carries a field inside its window and tags the origin date", () => {
    const r = row({ field: "epsBeat", evidence_refs: [{ url: "https://sec.gov/a", publishedAt: "2026-09-15" }] });
    expect(carryState(r, "2026-10-05")).toEqual({ state: "carried", carriedFrom: "2026-09-20", windowDays: 100 });
    expect(carryField(r, "2026-10-05")).toMatchObject({ value: true, agreement: "agree", verified: true, carriedFrom: "2026-09-20", asOf: "2026-10-05", evidenceRefs: r.evidence_refs });
    expect(carryField(r, "2026-10-05").reason).toMatch(/^Carried from 2026-09-20: /);
  });
  it("expires a field after its window and turns it into unknown without evidence", () => {
    const r = row({ field: "productCatalyst", evidence_refs: [{ url: "https://sec.gov/a", publishedAt: "2026-09-01" }] });
    expect(carryState(r, "2026-11-30")).toMatchObject({ state: "carried" });
    expect(carryState(r, "2026-12-01")).toMatchObject({ state: "expired", windowDays: 90 });
    expect(carryField(r, "2026-12-10")).toMatchObject({ value: null, verified: false, agreement: "single", evidenceRefs: [], agentValues: {}, carriedFrom: "2026-09-20" });
    expect(carryField(r, "2026-12-10").reason).toMatch(/^Expired: last scanned 2026-09-20/);
  });
  it("counts a true claim from its newest cited publication date, never later than the scan date", () => {
    const r = row({ field: "insiderOrInstitutionalBuying", as_of: "2026-09-20", evidence_refs: [{ url: "u", publishedAt: "2026-08-01" }, { url: "v", publishedAt: "2026-09-25" }] });
    expect(basisDate(r)).toBe("2026-09-20");
    const old = row({ field: "insiderOrInstitutionalBuying", evidence_refs: [{ url: "u", publishedAt: "2026-07-01" }] });
    expect(basisDate(old)).toBe("2026-07-01");
    expect(carryState(old, "2026-10-05")).toMatchObject({ state: "expired", windowDays: 60 });
    expect(basisDate(row({ field: "epsBeat", value: false, evidence_refs: [{ url: "u", publishedAt: "2026-01-01" }] }))).toBe("2026-09-20");
  });
  it("does not extend the window by copying a carried row again", () => {
    const first = carryField(row({ field: "narrativeChanged", value: false, as_of: "2026-09-01" }), "2026-09-25");
    expect(first).toMatchObject({ value: false, carriedFrom: "2026-09-01" });
    const second = row({ field: "narrativeChanged", value: false, as_of: "2026-09-25", carried_from: "2026-09-01", reason: first.reason });
    expect(carryField(second, "2026-09-26")).toMatchObject({ value: false, carriedFrom: "2026-09-01", reason: first.reason });
    expect(carryState(second, "2026-10-02")).toMatchObject({ state: "expired", carriedFrom: "2026-09-01" });
  });
  it("treats a row scanned on the requested date as fresh", () => {
    expect(carryState(row({ field: "epsBeat", as_of: "2026-10-05" }), "2026-10-05")).toEqual({ state: "fresh" });
    expect(ageDays("2026-09-01", "2026-10-01")).toBe(30);
  });
});
