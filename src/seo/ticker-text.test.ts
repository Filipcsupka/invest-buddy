import { describe, expect, it } from "vitest";
import { tickerSeoText } from "./ticker-text";
import { CORE_RULES } from "@/engine/display-score";
import { seoMessages } from "@/i18n/seo-messages";
import { plural } from "@/i18n";

const ids = CORE_RULES.map((rule) => rule.id);
const hits = (matched: number, unknown = 0) => ids.map((id, i) => ({ id, label: id, points: 1, matched: i < matched, detail: "", ...(i >= ids.length - unknown ? { unknown: true, matched: false } : {}) }));
const result = (state: string, ruleHits = hits(5), asOf = "2026-10-09") => ({ state: state as never, asOf, ruleHits });
const BANNED = /\b(buy|sell|recommend\w*|best stocks?|opportunit\w*|worth|kúpiť|nakúpiť|predať|odporúč\w*|príležitos\w*|najlepšie akcie)\b/i;

describe("tickerSeoText", () => {
  it("states n of 9 core rules, state, date and coverage in English", () => {
    const t = tickerSeoText("en", "ZZZZ", "Zed Corp", result("Watch", hits(5)))!;
    expect(t.title).toBe("ZZZZ, Zed Corp: meets 5 of 9 rules");
    expect(t.description).toContain("ZZZZ meets 5 of 9 rules as of 9 Oct 2026");
    expect(t.description).toContain("State: Watching");
    expect(t.description).toContain("Data for 9 of 9 rules");
    expect(t.summary).toContain("As of 9 Oct 2026, ZZZZ meets 5 of 9 rules");
  });
  it("counts rules without data as not met and lowers coverage", () => {
    const t = tickerSeoText("en", "ZZZZ", "ZZZZ", result("Watch", hits(4, 2)))!;
    expect(t.title).toBe("ZZZZ: meets 4 of 9 rules");
    expect(t.summary).toContain("Data covers 7 of 9 rules");
  });
  it("returns null without a score and a not-enough-data text for insufficient state", () => {
    expect(tickerSeoText("en", "ZZZZ", "Zed", null)).toBeNull();
    const t = tickerSeoText("sk", "ZZZZ", "Zed", result("Insufficient/invalid data", []))!;
    expect(t.title).toBe("ZZZZ, Zed: nedostatok údajov na skóre");
    expect(t.summary).toContain("nemá dosť údajov");
  });
  it("omits the date when the score has none", () => {
    const t = tickerSeoText("en", "ZZZZ", "ZZZZ", result("Wait", hits(3), ""))!;
    expect(t.description).not.toContain("as of");
    expect(t.summary.startsWith("ZZZZ meets 3 of 9 rules")).toBe(true);
  });
  it("uses Slovak plural forms of the total", () => {
    const forms = seoMessages.sk.rulesTotal;
    expect(plural("sk", forms, 1)).toBe("1 pravidla");
    expect(plural("sk", forms, 2)).toBe("2 pravidiel");
    expect(plural("sk", forms, 4)).toBe("4 pravidiel");
    expect(plural("sk", forms, 5)).toBe("5 pravidiel");
    expect(plural("sk", forms, 9)).toBe("9 pravidiel");
    const t = tickerSeoText("sk", "ZZZZ", "ZZZZ", result("Watch", hits(5)))!;
    expect(t.title).toBe("ZZZZ: spĺňa 5 z 9 pravidiel");
    expect(t.description).toContain("k 9. 10. 2026");
    expect(t.description).toContain("Stav: Sledovanie");
  });
  it("has no advice wording or price in any state and locale", () => {
    for (const locale of ["en", "sk"] as const) {
      for (const state of ["Setup met (>=18)", "Watch", "Wait", "Ignore", "Criteria broken", "Insufficient/invalid data"]) {
        const t = tickerSeoText(locale, "ZZZZ", "Zed Corp", result(state, hits(6)))!;
        for (const text of [t.title, t.description, t.summary]) {
          expect(text).not.toMatch(BANNED);
          expect(text).not.toMatch(/[$€]|\bEUR\b|\btarget\b/i);
        }
      }
    }
  });
  it("carries the same figures in English and Slovak", () => {
    const figures = (text: string) => [...text.replace(/\d{1,2}\.? (?:\d{1,2}\.|\w{3}) 2026/, "DATE").matchAll(/\d+/g)].map((m) => m[0]).join(",");
    for (const [matched, unknown] of [[5, 0], [0, 0], [9, 0], [4, 2]]) {
      const en = tickerSeoText("en", "ZZZZ", "ZZZZ", result("Watch", hits(matched, unknown)))!;
      const sk = tickerSeoText("sk", "ZZZZ", "ZZZZ", result("Watch", hits(matched, unknown)))!;
      expect(figures(sk.title)).toBe(figures(en.title));
      expect(figures(sk.description)).toBe(figures(en.description));
      expect(figures(sk.summary)).toBe(figures(en.summary));
    }
  });
  it("keeps meta descriptions under the snippet limit", () => {
    for (const locale of ["en", "sk"] as const) expect(tickerSeoText(locale, "ZZZZ", "Zed Corp", result("Watch"))!.description.length).toBeLessThanOrEqual(160);
  });
});
