import { expect, it } from "vitest";
import { FEATURE_TIERS, TIERS } from "@/config/tiers";
import { getPricingMessages } from "./pricing-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

it("has the same keys, non-empty text and matching placeholders in EN and SK", () => {
  const en = leaves(getPricingMessages("en"));
  const sk = Object.fromEntries(leaves(getPricingMessages("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key].trim(), key).not.toBe("");
    expect(placeholders(sk[key]), key).toBe(placeholders(text));
  }
});

it("has a row for every paid id and none for a free id", () => {
  const entries = [...Object.entries(TIERS), ...Object.entries(FEATURE_TIERS)];
  const paid = entries.filter(([, e]) => e.tier === "paid").map(([id]) => id).sort();
  for (const locale of ["en", "sk"] as const) expect(Object.keys(getPricingMessages(locale).rows).sort()).toEqual(paid);
});

it("writes no digit, price, currency, urgency or banned wording", () => {
  const banned = /beat the market|guarantee|\breturns?\b|\bbuy\b|\bbest\b|limited time|act now|hurry|lifetime|poraz\w* trh|zaručen|\bvýnos\w*|\bkúp\w*|\bnajlepš\w*|doživotn/i;
  for (const locale of ["en", "sk"] as const) {
    for (const [key, value] of leaves(getPricingMessages(locale))) {
      expect(value.replace(/Form 4/g, "Form"), `${locale}.${key}`).not.toMatch(/\d|EUR|€|\$|euro|—/i);
      expect(value, `${locale}.${key}`).not.toMatch(banned);
    }
  }
});
