import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { profileCopy } from "@/i18n/profile-messages";
import { getMessages } from "@/i18n";
import { ProfileBlock } from "./public-profile";

describe("public profile", () => {
  it("has a heading and an honest empty state in both languages", () => {
    for (const locale of ["en", "sk"] as const) {
      const html = renderToStaticMarkup(<ProfileBlock locale={locale} />);
      expect(html).toContain('aria-labelledby="public-profile-title"');
      expect(html).toContain('id="public-profile-title"');
      expect(html).toContain(profileCopy[locale].notComputed);
    }
  });

  it("shows the observed label and stored numbers with accessible names", () => {
    const html = renderToStaticMarkup(<ProfileBlock locale="en" horizon={{ ticker: "AAA", profile: "event_driven", values: { yoyLatest: 20, marketCapUsd: 3_000_000_000, atrPercent: 6, move5: 18, volumeRatio: 3 } }} />);
    expect(html).toContain("Higher volatility, event-driven");
    for (const label of ["Revenue growth", "Market cap", "ATR", "Drawdown", "5-day move", "Volume ratio"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain("No data");
  });

  it("adds the shorter-horizon note for event-driven and mixed profiles only", () => {
    for (const locale of ["en", "sk"] as const) {
      for (const profile of ["event_driven", "mixed"] as const) expect(renderToStaticMarkup(<ProfileBlock locale={locale} horizon={{ ticker: "AAA", profile, values: {} }} />)).toContain(profileCopy[locale].shortNote);
      for (const profile of ["sustained", "no_data"] as const) expect(renderToStaticMarkup(<ProfileBlock locale={locale} horizon={{ ticker: "AAA", profile, values: {} }} />)).not.toContain(profileCopy[locale].shortNote);
    }
  });

  it("keeps new public copy free of action and return language", () => {
    const banned = /\b(buy|sell|target|urgent|quick gains?|recycl\w*|returns?|picks?)\b|(?:kúp|nákup|predaj|predať|cieľov|naliehav|výnos)/i;
    for (const locale of ["en", "sk"] as const) {
      const scanner = getMessages(locale).scanner.presets;
      const text = JSON.stringify([profileCopy[locale], scanner["sustained-growers"], scanner["event-driven"]]);
      expect(text).not.toMatch(banned);
    }
  });
});
