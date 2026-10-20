import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages, type Locale } from "@/i18n";
import { ruleGroups, type StateKey } from "@/i18n/rules";
import { statusView } from "@/engine/status";
import { coreRulesMet, StatusPanel } from "./status-slider";

const rules = ruleGroups.flatMap((group) => group.rules);
const hits = (missing: string[] = [], bonusMatched = false) => rules.map((rule) => ({ id: rule.id, matched: rule.id === "catalyst" ? bonusMatched : !missing.includes(rule.id), unknown: missing.includes(rule.id) || (rule.id === "catalyst" && !bonusMatched) }));
function render(locale: Locale, state: StateKey, missing: string[] = [], bonusMatched = false, adviceOutput = false) {
  const view = statusView({ state, points: 25, ruleHits: hits(missing, bonusMatched), adviceOutput });
  return renderToStaticMarkup(<StatusPanel locale={locale} view={view} m={getMessages(locale)} adviceOutput={adviceOutput} asOf="11 Oct 2026" methodHref={`/${locale}/methodology#states`} reasons={state === "broken" ? ["Close below MA200"] : []} />);
}

describe("public status panel", () => {
  it.each(["en", "sk"] as const)("shows 100%% for all nine core rules in %s, independent of catalyst", (locale) => {
    const without = render(locale, "setup");
    const withBonus = render(locale, "setup", [], true);
    expect(without).toContain(locale === "en" ? "100%" : "100 %");
    expect(withBonus).toContain(locale === "en" ? "100%" : "100 %");
    expect(without).toContain(locale === "en" ? "Data from 9 of 9 core rules" : "Údaje pre 9 z 9 hlavných pravidiel");
    expect(without).toContain(locale === "en" ? "Bonus findings" : "Bonusové zistenia");
    expect(without).toContain(locale === "en" ? "Catalyst</a>: no data" : "Katalyzátor</a>: bez údajov");
    expect(withBonus).toContain(locale === "en" ? "Catalyst</a>: Met" : "Katalyzátor</a>: Splnené");
  });

  it("derives the band from core rules even when the stored state differs", () => {
    const html = render("en", "setup", ["revenue-acceleration", "earnings"]);
    expect(html).toContain('data-state="watch" aria-labelledby="status-title"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Data from 7 of 9 core rules");
    expect(html).toContain("With this data the highest band is Watching.");
  });

  it("shows rejection and missing score without a percentage", () => {
    expect(render("en", "broken")).toContain("No percentage: criteria broken");
    expect(render("en", "broken")).toContain("Rejected by: Close below MA200");
    expect(render("en", "insufficient")).not.toContain("100%");
  });

  it.each(["en", "sk"] as const)("shows the core rule count and band cutoffs in %s", (locale) => {
    const view = statusView({ state: "setup", points: 25, ruleHits: hits(["earnings"]), adviceOutput: false });
    const m = getMessages(locale);
    const html = renderToStaticMarkup(<StatusPanel locale={locale} view={view} m={m} adviceOutput={false} asOf={null} methodHref="/m" reasons={[]} coreMet={8} />);
    expect(html).toContain(locale === "en" ? "Meets 8 of 9 rules" : "Spĺňa 8 z 9 pravidiel");
    expect(html).toContain(locale === "en" ? "Conditions met 72%+, Watching 60%+, Waiting 48%+" : "Podmienky splnené od 72 %, Sledovanie od 60 %, Čakanie od 48 %");
    expect(html).toContain(locale === "en" ? "all 23 core points evidenced that is 17, 14 and 12 points" : "Pri všetkých 23 základných bodoch s údajmi je to 17, 14 a 12 bodov");
    expect(html).toContain(locale === "en" ? "18/15/12 are points of 25" : "18/15/12 z príručky sú body z 25");
    expect(coreRulesMet(hits(["earnings"]).map((hit) => ({ id: hit.id, matched: hit.matched })))).toBe(8);
  });

  it("omits the cutoffs when criteria are broken", () => {
    const view = statusView({ state: "broken", points: 5, ruleHits: hits(), adviceOutput: false });
    const html = renderToStaticMarkup(<StatusPanel locale="en" view={view} m={getMessages("en")} adviceOutput={false} asOf={null} methodHref="/m" reasons={[]} coreMet={4} />);
    expect(html).toContain("Meets 4 of 9 rules");
    expect(html).not.toContain("Waiting 48%+");
  });

  it("keeps advice wording out of public output when the flag is on", () => {
    expect(render("en", "setup", [], true, true)).not.toContain("Buy zone");
    expect(render("sk", "setup", [], true, true)).not.toContain("Zóna nákupu");
  });
});
