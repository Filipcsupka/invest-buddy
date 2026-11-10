import { expect, it } from "vitest";
import { getAuthMessages } from "./auth-messages";
import { getWelcomeMessages } from "./welcome-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const banned = /\bbuy\b|\bsell\b|\bpick(s|ed)?\b|recommend|best stocks|\bstrong\b|opportunit|upside|beat the market|guarantee|don't miss|limited time|act now|hurry|returns?\b|outperform|\bkúp\w*|odporúča|príležitos|zaručen|nenechajte si ujsť|obmedzený čas|výnos|[–—]|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i;

it.each([["welcome", getWelcomeMessages], ["auth", getAuthMessages]] as const)("%s copy has the same keys and placeholders in EN and SK, and no banned wording", (_, get) => {
  const en = leaves(get("en"));
  const sk = Object.fromEntries(leaves(get("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key]!.trim(), key).not.toBe("");
    expect(placeholders(sk[key]!), key).toBe(placeholders(text));
    expect(text, `en.${key}`).not.toMatch(banned);
    expect(sk[key], `sk.${key}`).not.toMatch(banned);
  }
});

it("keeps the Slovak copy translated", () => {
  const en = Object.fromEntries(leaves(getWelcomeMessages("en")));
  const same = Object.entries(Object.fromEntries(leaves(getWelcomeMessages("sk")))).filter(([key, value]) => en[key] === value && /[a-z]{4,}/i.test(value)).map(([key]) => key);
  expect(same.filter((key) => !["tiers.plusTitle", "areas.items.etfs.title"].includes(key))).toEqual([]);
});
