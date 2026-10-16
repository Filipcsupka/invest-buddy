import { expect, it } from "vitest";
import { getLandingMessages } from "./landing-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

it("has the same keys, non-empty text and matching placeholders in EN and SK", () => {
  const en = leaves(getLandingMessages("en"));
  const sk = Object.fromEntries(leaves(getLandingMessages("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key].trim(), key).not.toBe("");
    expect(placeholders(sk[key]), key).toBe(placeholders(text));
  }
});

it("names no price, no promise and no instruction, and uses no em dash", () => {
  const banned = /\bbuy\b|\bsell\b|\bbest\b|\bpick\b|recommend|\breturns?\b|guarantee|beat the market|limited time|act now|hurry|€|\$|EUR|kúp\w*|najlepš\w*|výnos\w*|zaručen|odporúč\w*/i;
  for (const locale of ["en", "sk"] as const) {
    for (const [key, value] of leaves(getLandingMessages(locale))) {
      expect(value, `${locale}.${key}`).not.toMatch(banned);
      expect(value, `${locale}.${key}`).not.toContain("—");
    }
  }
});
