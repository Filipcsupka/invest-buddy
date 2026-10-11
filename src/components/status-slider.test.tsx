import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages, type Locale } from "@/i18n";
import { ruleGroups, type StateKey } from "@/i18n/rules";
import { statusView } from "@/engine/status";
import { StatusPanel } from "./status-slider";

const allRules = ruleGroups.flatMap((group) => group.rules.map((rule) => rule.id));
const hits = (unknown: string[] = []) => allRules.map((id) => (unknown.includes(id) ? { id, unknown: true } : { id, matched: true }));
const labels: Record<Locale, Record<StateKey, string>> = {
  en: { broken: "Criteria broken", ignore: "Not now", wait: "Waiting", watch: "Watching", setup: "Conditions met", insufficient: "Not enough data" },
  sk: { broken: "Kritériá porušené", ignore: "Mimo výberu", wait: "Čakanie", watch: "Sledovanie", setup: "Podmienky splnené", insufficient: "Nedostatok údajov" },
};
const steps: Record<StateKey, number | null> = { broken: 1, ignore: 2, wait: 3, watch: 4, setup: 5, insufficient: null };

function render(state: StateKey, opts: { locale?: Locale; advice?: boolean; points?: number | null; unknown?: string[]; reasons?: string[] } = {}) {
  const locale = opts.locale ?? "en";
  const adviceOutput = opts.advice ?? false;
  const view = statusView({ state, points: opts.points === undefined ? 18 : opts.points, ruleHits: hits(opts.unknown), adviceOutput });
  return renderToStaticMarkup(<StatusPanel view={view} m={getMessages(locale)} adviceOutput={adviceOutput} asOf="9 Oct 2026" methodHref={`/${locale}/methodology#states`} reasons={opts.reasons ?? []} />);
}

describe("StatusPanel", () => {
  for (const locale of ["en", "sk"] as const) {
    for (const state of Object.keys(steps) as StateKey[]) {
      it(`renders ${state} in ${locale}`, () => {
        const html = render(state, { locale });
        expect(html).toContain(labels[locale][state]);
        const step = steps[state];
        const current = html.match(/aria-current="step"/g) ?? [];
        expect(current).toHaveLength(step === null ? 0 : 1);
        if (step !== null) expect(html).toMatch(new RegExp(`<li[^>]*data-state="${state}" data-active=""`));
        expect(html).toContain(`data-state="${state}"`);
        expect(html).toContain("<svg");
        expect(html.match(/<li[^>]*data-state=/g)).toHaveLength(5);
      });
    }
  }

  it("builds the summary sentence per state", () => {
    expect(render("setup", { points: 19 })).toContain("Status Conditions met, step 5 of 5, 19 of 25 points, data for 25 of 25 points");
    expect(render("broken", { points: 20 })).toContain("Status Criteria broken, step 1 of 5, points not counted");
    expect(render("insufficient", { points: null })).toContain("Status Not enough data, no score");
    expect(render("watch", { locale: "sk", points: 16 })).toContain("Stav Sledovanie, stupeň 4 z 5, 16 z 25 bodov");
  });

  it("shows coverage with no-data rules, never as 0", () => {
    const html = render("watch", { points: 16, unknown: ["catalyst", "macro-data"] });
    expect(html).toContain("Data: 20 of 25 points");
    expect(html).toContain("No data: ");
    expect(html).toContain('href="#rule-catalyst"');
    expect(html).toContain("Catalyst (2)");
    expect(html).toContain("Macro data (3)");
    expect(html).not.toContain("0 of 25 points");
    expect(render("setup", { locale: "sk", unknown: ["catalyst"] })).toContain("Údaje: 23 z 25 bodov");
    expect(render("setup", { locale: "sk", unknown: ["catalyst"] })).toContain("Bez údajov: ");
  });

  it("says all 25 points have data when nothing is missing", () => {
    expect(render("setup")).toContain("Data: all 25 points");
    expect(render("setup", { locale: "sk" })).toContain("Údaje: všetkých 25 bodov");
  });

  it("adds the cap line only when known points are under 18 and the band is neither broken nor insufficient", () => {
    const low = render("wait", { points: 13, unknown: ["revenue-acceleration", "earnings", "macro-data"] });
    expect(low).toContain("With this data the ticker cannot reach Conditions met.");
    expect(render("wait", { points: 13, unknown: ["catalyst"] })).not.toContain("cannot reach");
    expect(render("broken", { points: 13, unknown: ["revenue-acceleration", "earnings", "macro-data"] })).not.toContain("cannot reach");
  });

  it("shows no coverage line and no points for insufficient, and the reasons", () => {
    const html = render("insufficient", { points: null, reasons: ["Fewer than 200 price bars"] });
    expect(html).toContain("Why: Fewer than 200 price bars");
    expect(html).not.toContain("Data: ");
    expect(html).not.toContain("of 25 points");
    expect(html).toContain("data-none");
  });

  it("strikes the points and names the rejection for broken", () => {
    const html = render("broken", { points: 20, reasons: ["Close below MA200"] });
    expect(html).toContain("Points not counted: ");
    expect(html).toContain("<s ");
    expect(html).toContain("Rejected by: Close below MA200");
  });

  it("renders five fixed chips in order with three states", () => {
    const view = statusView({ state: "setup", points: 18, ruleHits: hits(["catalyst"]), adviceOutput: false, signals: { insiderNetBuy: true, epsBeat: false, guidanceRaised: null, productCatalyst: null } });
    const html = renderToStaticMarkup(<StatusPanel view={view} m={getMessages("en")} adviceOutput={false} asOf={null} methodHref="/en/methodology" reasons={[]} />);
    const order = [...html.matchAll(/data-confirm="([a-z-]+)" data-id="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    expect(order).toEqual(["insider:met", "epsBeat:not-met", "guidanceRaised:no-data", "catalyst:no-data", "volume:met"]);
    expect(html).toContain("Insider net buying (Form 4)");
    expect(html).toContain("Context only. They do not change the status.");
    expect(html).toContain(": no data");
  });

  it("follows ADVICE_OUTPUT for the green label only", () => {
    for (const [locale, off, on] of [["en", "Conditions met", "Buy zone"], ["sk", "Podmienky splnené", "Zóna nákupu"]] as const) {
      const flagOff = render("setup", { locale, advice: false });
      const flagOn = render("setup", { locale, advice: true });
      expect(flagOff).toContain(off);
      expect(flagOff).not.toContain(on);
      expect(flagOn).toContain(on);
      expect(flagOn).not.toContain(off);
    }
    expect(render("watch", { advice: true, points: 16 })).not.toContain("Buy zone");
  });
});
