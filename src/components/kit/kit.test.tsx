import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkContrast, contrastTable } from "../../../scripts/check-contrast";
import { getKitMessages } from "@/i18n/kit-messages";
import { CountUp, DataTable, LockCard, RuleRow, RuleTable, ScoreBar, ScoreDial, SectionHead, StateChip, StateStrip, TierBadge, TierBanner, kitState, kitStates, splitUnit } from "./index";

const globals = readFileSync("src/app/globals.css", "utf8");
const kitCss = readFileSync("src/components/kit/kit.css", "utf8");
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("kit palette", () => {
  it("passes WCAG AA for every pair, light and dark, including the state, signal and tier tokens", () => {
    expect(checkContrast(globals)).toEqual([]);
    const names = contrastTable(globals).map((row) => `${row.fg}/${row.bg}`);
    for (const pair of ["tier-on/tier", "tier/ground", "tier-line/ground", "st-wait/st-wait-wash", "st-setup-on/st-setup", "signal/signal-tint", "ink-2/tier-wash"]) expect(names, pair).toContain(pair);
  });
  it("defines every token the kit stylesheet reads", () => {
    const defined = new Set([...globals.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    for (const used of new Set([...kitCss.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))) {
      const local = ["--c", "--w", "--value", "--at", "--i", "--to", "--kit-n", "--dial", "--table-bg", "--frame-bg", "--reveal-delay", "--strip-duration"];
      if (!local.includes(used)) expect(defined.has(used), used).toBe(true);
    }
  });
  it("keeps raw colours out of the kit stylesheet (the edge mask is alpha, not colour)", () => {
    const withoutMask = kitCss.replace(/mask-image:[^;]+;/g, "");
    expect(withoutMask).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
  it("animates only from a start frame to the declared final state", () => {
    for (const m of kitCss.matchAll(/@keyframes ([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      if (["kit-count", "kit-marquee", "kit-show", "kit-hide"].includes(m[1])) continue;
      expect(m[2], m[1]).not.toMatch(/\bto\s*\{/);
    }
  });
});

describe("StateChip", () => {
  it.each(kitStates)("prints the label and a shape for %s", (state) => {
    const html = renderToStaticMarkup(<StateChip state={state} label={`Label ${state}`} describedBy="d" />);
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain("<svg");
    expect(text(html)).toBe(`Label ${state}`);
    expect(html).toContain('aria-describedby="d"');
  });
  it("keeps the label for screen readers when only the shape shows", () => {
    const html = renderToStaticMarkup(<StateChip state="broken" label="Criteria broken" iconOnly />);
    expect(html).toMatch(/class="visually-hidden">Criteria broken</);
  });
  it("folds the pullback qualifier into its own state", () => {
    expect(kitState("watch", true)).toBe("pullback");
    expect(kitState("wait", true)).toBe("wait");
  });
});

describe("ScoreBar and ScoreDial", () => {
  it("is a meter with the percent and the state in the value text", () => {
    const html = renderToStaticMarkup(<ScoreBar percent={64.5} state="watch" stateLabel="Sledovanie" locale="sk" />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="64.5"');
    expect(html).toMatch(/aria-valuetext="64,5\s%/);
    expect(html).toContain("Sledovanie");
    expect(html).toMatch(/--value:\s*64\.5/);
  });
  it("draws no fill and says No score when there is no percent", () => {
    const bar = renderToStaticMarkup(<ScoreBar percent={null} state="broken" stateLabel="Criteria broken" locale="en" />);
    expect(bar).toContain('role="img"');
    expect(bar).toContain("data-empty");
    expect(text(bar)).toContain("No score");
    const dial = renderToStaticMarkup(<ScoreDial percent={null} state="insufficient" stateLabel="Not enough data" locale="en" />);
    expect(dial).not.toContain("kit-dial-value");
    expect(dial).toContain("No score");
  });
  it("marks the band cutoffs it has reached and plays only when asked", () => {
    const still = renderToStaticMarkup(<ScoreDial percent={65} state="watch" stateLabel="Watching" locale="en" />);
    expect(still.match(/kit-dial-tick" data-reached/g)).toHaveLength(2);
    expect(still).not.toContain('data-motion="run"');
    expect(renderToStaticMarkup(<ScoreDial percent={65} state="watch" stateLabel="Watching" locale="en" motion="load" />)).toContain('data-motion="run"');
    expect(renderToStaticMarkup(<ScoreBar percent={65} state="watch" stateLabel="Watching" locale="en" motion="view" />)).toContain('data-motion="view"');
  });
  it("splits the percent sign for the dial readout", () => {
    expect(splitUnit("72 %")).toEqual(["72", "%"]);
    expect(splitUnit("72%")).toEqual(["72", "%"]);
    expect(splitUnit("64,5 %")).toEqual(["64,5", "%"]);
    expect(splitUnit("No score")).toEqual(["No score", ""]);
  });
});

describe("RuleRow", () => {
  const table = (locale: "en" | "sk") =>
    renderToStaticMarkup(
      <RuleTable locale={locale} label="Rules" motion="load">
        <RuleRow index={0} id="earnings" locale={locale} name="Earnings" needs="An EPS beat" value="yes" result="pass" max={3} />
        <RuleRow index={1} id="dip" locale={locale} name="Dip" needs="A 5 to 10% dip" value="2%" result="fail" max={2} />
        <RuleRow index={2} id="macro-data" locale={locale} name="Macro" needs="Flag set" result="none" max={3} />
      </RuleTable>,
    );
  it("shows Needs, value, result and points of N, and never 0 points for no data", () => {
    const html = table("en");
    expect(html).toContain('id="rule-earnings"');
    expect(text(html)).toContain("+3 of 3");
    expect(text(html)).toContain("0 of 2");
    const macro = html.slice(html.indexOf('id="rule-macro-data"'));
    expect(text(macro)).toContain("No data");
    expect(text(macro)).not.toMatch(/\b0 of 3\b/);
    expect(html).toContain('data-motion="run"');
    expect(html).toMatch(/<th scope="col">Rule<\/th>/);
  });
  it("speaks Slovak in the header and the points", () => {
    const html = table("sk");
    expect(text(html)).toContain("Vyžaduje");
    expect(text(html)).toContain("+3 z 3");
    expect(text(html)).toContain("Bez údajov");
  });
});

describe("CountUp", () => {
  it("always holds the final localized text, and counts only integers up to 999", () => {
    const html = renderToStaticMarkup(<CountUp value={72} locale="sk" format="percent" />);
    expect(html).toMatch(/kit-count-final">72\s%</);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/--to:\s*72/);
    expect(renderToStaticMarkup(<CountUp value={64.5} locale="en" format="percent" />)).not.toContain("kit-count-live");
    expect(renderToStaticMarkup(<CountUp value={1234} locale="sk" />)).not.toContain("kit-count-live");
    expect(renderToStaticMarkup(<CountUp value={35} locale="en" motion="none" />)).not.toContain("kit-count-live");
  });
});

describe("StateStrip", () => {
  const change = { ticker: "NVDA", from: "watch" as const, to: "setup" as const, fromLabel: "Watching", toLabel: "Conditions met", href: "/en/company/NVDA", sentence: "NVDA: Watching to Conditions met" };
  it("has one real list and a hidden copy that is out of the tab order", () => {
    const html = renderToStaticMarkup(<StateStrip label="State changes" changes={[change]} empty="None" pauseLabel="Pause" playLabel="Resume" />);
    expect(html.match(/<ul/g)).toHaveLength(2);
    expect(html).toMatch(/kit-strip-copy" aria-hidden="true"/);
    expect(html).toMatch(/tabindex="-1"/i);
    expect(html).toContain(">Pause<");
    expect(html).toContain("NVDA: Watching to Conditions met");
  });
  it("says so when nothing changed, without a moving rail", () => {
    const html = renderToStaticMarkup(<StateStrip label="State changes" changes={[]} empty="No state changed." pauseLabel="Pause" playLabel="Resume" />);
    expect(html).not.toContain("kit-strip-rail");
    expect(text(html)).toContain("No state changed.");
  });
});

describe("tiers, heads and tables", () => {
  it("hides the banner unless the tier logic sets a mode", () => {
    expect(renderToStaticMarkup(<TierBanner title="Admin view" note="n" badgeLabel="Paid" />)).toBe("");
    expect(text(renderToStaticMarkup(<TierBanner mode="admin" title="Admin view: every section is visible." note="n" badgeLabel="Paid" />))).toContain("Admin view: every section is visible.");
  });
  it("prints the tier word on the badge", () => {
    expect(text(renderToStaticMarkup(<TierBadge tier="paid" label="Platené" />))).toBe("Platené");
    expect(renderToStaticMarkup(<TierBadge tier="free" label="Free" />)).not.toContain("<svg");
  });
  it("keeps the status first on a lock card", () => {
    const html = renderToStaticMarkup(<LockCard title="Part of the Paid tier" behindLabel="Behind this card" items={["Form 4 filings"]} status={<StateChip state="watch" label="Watching" />} statusNote="The status stays visible." badgeLabel="Paid" />);
    expect(html.indexOf("Watching")).toBeLessThan(html.indexOf("<span>Part of the Paid tier"));
    expect(text(html)).toContain("Form 4 filings");
  });
  it("renders a section head without anything above the title", () => {
    const html = renderToStaticMarkup(<SectionHead id="x" title="Rule by rule" lede="One line." meta="16 Oct" />);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("One line."));
    expect(html).toMatch(/<div class="kit-section-main"><h2/);
  });
  it("gives the table scroll box a role, a label and a tab stop", () => {
    const html = renderToStaticMarkup(<DataTable label="Sample"><tbody><tr><td>1</td></tr></tbody></DataTable>);
    expect(html).toMatch(/role="region" aria-label="Sample" tabindex="0"/i);
  });
});

describe("kit copy", () => {
  const en = getKitMessages("en");
  const sk = getKitMessages("sk");
  const leaves = (value: unknown, path = ""): [string, string][] =>
    typeof value === "string" ? [[path, value]] : Array.isArray(value) ? value.flatMap((v, i) => leaves(v, `${path}[${i}]`)) : Object.entries(value as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  it("has the same keys and placeholders in English and Slovak", () => {
    const a = new Map(leaves(en));
    const b = new Map(leaves(sk));
    expect([...b.keys()]).toEqual([...a.keys()]);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of a) expect(holes(b.get(key)!), key).toEqual(holes(value));
  });
  it("stays informational (ADR-001) and plain", () => {
    for (const [key, value] of [...leaves(en), ...leaves(sk)]) {
      expect(value, key).not.toMatch(/\b(buy|sell|recommend\w*|best|pick|target|guarantee\w*|odporúča\w*|kúpiť|predať)\b/i);
      expect(value, key).not.toMatch(/[–—]|!/);
      expect(value, key).not.toMatch(/€|EUR|\$\d/);
    }
  });
});
