import { expect, it } from "vitest";
import { FEATURES, TIER_LIMITS, tierEntry, type TierId } from "@/config/tiers";
import { PAYWALL_SEGMENTS } from "@/paywall/segments";
import { getTierMessages, limitNote, lockBody } from "./tier-messages";

const locales = ["en", "sk"] as const;
const ids = [...Object.keys(PAYWALL_SEGMENTS), ...FEATURES] as TierId[];
const paid = ids.filter((id) => tierEntry(id).tier === "paid");
const limited = ids.filter((id) => { const e = tierEntry(id); return e.tier === "paid" && e.mode === "limit"; });

// ADR-001 and docs/wording-gate.md: no action wording on a security, no advice words.
const banned: Record<(typeof locales)[number], RegExp> = {
  en: /\b(buy|sell|add|reduce|start position|recommend\w*|advice|advis\w*|should|must|target|trade|invest\w*|profit|guarantee\w*)\b/i,
  sk: /(kúp|nakúp|prikúp|predaj|predať|zníž|odporúč|poradenstv|pokyn|obchoduj|investuj|zisk|zaruč)/i,
};

function strings(locale: (typeof locales)[number]): string[] {
  const m = getTierMessages(locale);
  return [m.badge, m.badgeHint, m.lockTitle, m.lockSuffix, m.previewNote, ...Object.values(m.days), ...Object.values(m.teaser), ...Object.values(m.limit)];
}

it("has a teaser for every paid id and a depth note for every limited id", () => {
  for (const locale of locales) {
    const m = getTierMessages(locale);
    expect(paid.filter((id) => !m.teaser[id]), locale).toEqual([]);
    expect(limited.filter((id) => !m.limit[id]), locale).toEqual([]);
    expect(Object.keys(m.teaser).filter((id) => !paid.includes(id as TierId)), locale).toEqual([]);
  }
});

it("keeps EN and SK in the same shape with the same placeholders", () => {
  const en = getTierMessages("en");
  const sk = getTierMessages("sk");
  expect(Object.keys(sk.teaser).sort()).toEqual(Object.keys(en.teaser).sort());
  expect(Object.keys(sk.limit).sort()).toEqual(Object.keys(en.limit).sort());
  const tokens = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const id of Object.keys(en.limit) as TierId[]) expect(tokens(sk.limit[id]!), id).toEqual(tokens(en.limit[id]!));
  for (const form of ["one", "few", "many", "other"] as const) expect(tokens(sk.days[form])).toEqual(["{n}"]);
  expect(sk.badge).not.toBe(en.badge);
});

it.each(locales)("keeps %s free of banned wording", (locale) => {
  for (const text of strings(locale)) expect(text, text).not.toMatch(banned[locale]);
});

it("fills every placeholder in the rendered notes", () => {
  for (const locale of locales) {
    for (const id of limited) {
      const entry = tierEntry(id);
      if (entry.tier !== "paid" || entry.mode !== "limit") continue;
      const note = limitNote(locale, id, TIER_LIMITS.free[entry.limit]);
      expect(note, `${locale} ${id}`).not.toMatch(/\{\w+\}/);
      expect(note.length).toBeGreaterThan(0);
    }
  }
  expect(lockBody("en", "idea-card", "3 items")).toContain("3 items");
});

it("declines Slovak day counts", () => {
  expect(limitNote("sk", "score-history", 1)).toContain("1 deň");
  expect(limitNote("sk", "score-history", 3)).toContain("3 dni");
  expect(limitNote("sk", "score-history", 30)).toContain("30 dní");
  expect(limitNote("en", "score-history", 30)).toContain("30 days");
});
