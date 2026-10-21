import { describe, expect, it } from "vitest";
import { catalystLine, formatResearchCard, graduationLine, macroLine, ownerContextLines, revisionLine, type OwnerContext, type ResearchCardInput } from "./research-card";
import type { CatalystEvent } from "../data/catalyst-calendar";
import type { EstimateRevisionFact } from "../data/estimate-revisions";
import type { Graduation } from "../engine/graduation";

const input: ResearchCardInput = { symbol: "SMPL", locale: "en", site: "https://site.test", state: "WATCH", stateSince: "2026-10-07",
  history: [{ state: "DISCOVERED", date: "2026-10-06" }, { state: "WATCH", date: "2026-10-07" }], promotionStatus: "proposed", scorable: true,
  card: { verdict: "Robotics supplier with a contract.", whatHappened: [{ text: "Signed a contract.", findingIds: ["f1"] }],
    whyItMatters: [{ text: "Large relative to revenue.", findingIds: ["f1"] }], opportunityCost: null },
  facts: [{ key: "one", findingId: "f1", verified: true, confirmed: true, sourceClass: "primary", sourceName: "Company IR", url: "https://example.test/ir",
    claim: "Signed contract", figures: [{ label: "Value", value: "USD 1,250M" }] }], upgradeTriggers: ["Quarterly report confirms revenue."],
  invalidation: ["Contract is cut."], cashEur: 640 };

describe("research card", () => {
  it.each(["DISCOVERED", "WATCH", "START_READY", "ADD_READY", "HOLD", "REDUCE", "BROKEN", "DROPPED"] as const)("renders pipeline state %s", state => {
    expect(formatResearchCard({ ...input, state })).toContain(state);
  });
  it.each(["en", "sk"] as const)("renders owner sections in %s", locale => {
    const output = formatResearchCard({ ...input, locale })!;
    expect(output).toContain("SMPL"); expect(output).toContain("EUR 0"); expect(output).toContain("USD 1,250M");
    expect(output).toContain("https://site.test/"); expect(output).toContain("Company IR");
  });
  it("drops unsupported lines and refuses a card without checked What happened", () => {
    expect(formatResearchCard({ ...input, facts: [] })).toBeNull();
    const output = formatResearchCard({ ...input, card: { ...input.card!, whyItMatters: [{ text: "Dropped text", findingIds: ["missing"] }] } })!;
    expect(output).not.toContain("Dropped text");
  });
  it("marks facts that are verified but unconfirmed", () => {
    expect(formatResearchCard({ ...input, facts: [{ ...input.facts[0], confirmed: false }] })).toContain("(UNCONFIRMED)");
  });
  it("renders an unscored foreign WATCH without a trading call", () => {
    const output = formatResearchCard({ ...input, symbol: "SIE", scorable: false, promotionStatus: "none" })!;
    expect(output).toContain("WATCH");
    expect(output).toContain("outside scoring coverage");
    expect(output).not.toMatch(/<b>(BUY|WAIT|ČAKAJ|KÚPIŤ)<\/b>/);
  });
  it("keeps complete links under Telegram's limit", () => {
    const facts = Array.from({ length: 4 }, (_, n) => ({ ...input.facts[0], key: `key${n}`, findingId: `f${n + 1}`,
      url: `https://example.test/${n}/${"x".repeat(470)}`, figures: Array.from({ length: 5 }, (_, k) => ({ label: `Figure ${k}`, value: "9".repeat(75) })) }));
    const card = { ...input.card!, whatHappened: Array.from({ length: 3 }, () => ({ text: "a".repeat(290), findingIds: ["f1"] })),
      whyItMatters: Array.from({ length: 2 }, () => ({ text: "b".repeat(290), findingIds: ["f1"] })) };
    const output = formatResearchCard({ ...input, facts, card, upgradeTriggers: ["u".repeat(280)], invalidation: ["i".repeat(280)] })!;
    expect(output.length).toBeLessThanOrEqual(4096);
    expect((output.match(/<a /g) ?? []).length).toBe((output.match(/<\/a>/g) ?? []).length);
    expect(output).not.toContain("<b>Numbers</b>");
  });
});

describe("owner context lines (P7)", () => {
  const graduation: Graduation = { symbol: "SMPL", tier: "STARTER", next: "STANDARD", ruleConfigVersion: "test", line: "STANDARD needs: ...", steps: [
    { tier: "STANDARD", met: false, conditions: [
      { id: "score", met: true, text: "" },
      { id: "company", met: false, text: "", pointsShort: 2, missingRules: [{ id: "earnings", points: 3, carried: false }, { id: "revenue-acceleration", points: 4, carried: true }],
        rating: { need: "Strong", have: "Good", points: 4, max: 10, narrativeLowers: false } },
      { id: "freshData", met: false, text: "", carriedFields: [{ field: "revenueAccelerating", carriedFrom: "2026-09-20" }] },
    ] },
    { tier: "FULL", met: false, conditions: [{ id: "execution", met: false, text: "" }] },
  ] };
  const revision: EstimateRevisionFact = { ticker: "SMPL", asOf: "2026-10-19", reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", currentObservedOn: "2026-10-19",
    currentEstimate: 1.23, sourceId: "alphavantage", points: 0, windows: [
      { days: 30, fromObservedOn: "2026-09-19", fromEstimate: 1.18, change: 0.05, changePct: 4.24, direction: "up" },
      { days: 60, fromObservedOn: null, fromEstimate: null, change: null, changePct: null, direction: null },
    ] };
  const context: OwnerContext = {
    nextCatalyst: { type: "earnings", symbol: "SMPL", date: "2026-11-05", daysUntil: 17, timeOfDay: "post-market", stale: false, previousReportDate: "2026-11-03" },
    macro: [{ date: "2026-10-28", kind: "FOMC", label: "FOMC decision", sessions: 7 }], graduation, revision,
  };

  it("renders the four lines in English", () => {
    expect(ownerContextLines(context, "en")).toEqual([
      "Next catalyst: earnings report 2026-11-05, after the close (in 17 days), moved from 2026-11-03",
      "Next macro event: FOMC decision 2026-10-28 (in 7 sessions)",
      "Next tier: Standard needs company Strong (now Good, 4 of 10 points, 2 short; open: EPS beat or guidance raise +3, revenue acceleration on fresh data); fresh data for revenueAccelerating (carried from 2026-09-20).",
      "Estimate revision, not scored: report 2026-11-05, EPS estimate 1.23; 30d +0.05 (+4.24%), 60d n/a. Alpha Vantage.",
    ]);
  });

  it("renders Slovak with a decimal comma and Slovak plurals", () => {
    const lines = ownerContextLines(context, "sk");
    expect(lines[0]).toBe("Najbližší katalyzátor: výsledky 2026-11-05, po zatvorení trhu (o 17 dní), presunuté z 2026-11-03");
    expect(lines[1]).toBe("Najbližšia makro udalosť: Rozhodnutie FOMC 2026-10-28 (o 7 obchodných dní)");
    expect(lines[2]).toMatch(/^Ďalší stupeň: Štandardný vyžaduje hodnotenie firmy Silné \(teraz Dobré, 4 z 10 bodov, chýba 2;/);
    expect(lines[3]).toContain("odhad EPS 1,23; 30 d +0,05 (+4,24%), 60 d nedostupné");
  });

  it("renders a dated research catalyst with its claim and marks it unconfirmed", () => {
    expect(catalystLine({ type: "research", symbol: "SMPL", date: "2026-10-19", daysUntil: 0, kind: "contract", claim: "Award decision due", confirmed: false, findingId: 4 }, "en"))
      .toBe("Next catalyst: contract 2026-10-19 (today): Award decision due (unconfirmed)");
    expect(catalystLine({ ...context.nextCatalyst!, stale: true, previousReportDate: null, timeOfDay: null, daysUntil: 1 } as CatalystEvent, "en"))
      .toBe("Next catalyst: earnings report 2026-11-05 (in 1 day), calendar date may be out of date");
  });

  it("keeps graduation and estimate revisions off a public audience", () => {
    expect(revisionLine(revision, "en", "public")).toBeNull();
    const lines = ownerContextLines(context, "en", "public");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).not.toMatch(/Next tier|Estimate revision/);
  });

  it("has no graduation line without a next tier or open condition", () => {
    expect(graduationLine({ ...graduation, next: null, steps: [] }, "en")).toBeNull();
    expect(graduationLine({ ...graduation, steps: [{ tier: "STANDARD", met: true, conditions: [{ id: "score", met: true, text: "" }] }] }, "en")).toBeNull();
    expect(macroLine([], "en")).toBeNull();
    expect(ownerContextLines(null, "en")).toEqual([]);
  });

  it("adds an escaped dates section to the research card and none without context", () => {
    const withClaim: OwnerContext = { ...context, nextCatalyst: { type: "research", symbol: "SMPL", date: "2026-11-01", daysUntil: 13, kind: "contract", claim: "A <b> & B", confirmed: true, findingId: 1 } };
    const output = formatResearchCard({ ...input, context: withClaim })!;
    expect(output).toContain("<b>Dates and next tier</b>");
    expect(output).toContain("A &lt;b&gt; &amp; B");
    expect(output).toContain("Next tier: Standard needs");
    expect(formatResearchCard(input)).not.toContain("Dates and next tier");
    expect(formatResearchCard({ ...input, locale: "sk", context })).toContain("<b>Termíny a ďalší stupeň</b>");
  });
});
