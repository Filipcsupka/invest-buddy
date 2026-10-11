import { describe, expect, it } from "vitest";
import { formatResearchCard, type ResearchCardInput } from "./research-card";

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
