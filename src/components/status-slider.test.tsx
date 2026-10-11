import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages, type Locale } from "@/i18n";
import { ruleGroups, type StateKey } from "@/i18n/rules";
import { statusView } from "@/engine/status";
import { StatusPanel } from "./status-slider";

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

  it("keeps advice wording out of public output when the flag is on", () => {
    expect(render("en", "setup", [], true, true)).not.toContain("Buy zone");
    expect(render("sk", "setup", [], true, true)).not.toContain("Zóna nákupu");
  });
});
