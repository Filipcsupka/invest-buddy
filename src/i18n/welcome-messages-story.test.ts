import { expect, it } from "vitest";
import { getWelcomeStoryMessages } from "./welcome-messages-story";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : typeof value === "boolean" ? [] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
// Same list as welcome-messages.test.ts plus urgency and return wording (ADR-001, docs/wording-gate.md).
const banned = /\bbuy\b|\bsell\b|\bpick(s|ed)?\b|recommend|best stocks|\bstrong\b|opportunit|upside|beat the market|guarantee|don't miss|limited time|act now|hurry|last chance|returns?\b|outperform|profit|\bkúp\w*|\bpredaj\w*|odporúča|príležitos|zaručen|nenechajte si ujsť|obmedzený čas|výnos|[–—]|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i;
// Kind codes in the comparison table are data, not copy.
const codes = /\.(u|s|t)$/;

it("has the same keys and placeholders in EN and SK, and no banned wording", () => {
  const en = leaves(getWelcomeStoryMessages("en")).filter(([key]) => !codes.test(key));
  const sk = Object.fromEntries(leaves(getWelcomeStoryMessages("sk")).filter(([key]) => !codes.test(key)));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key]!.trim(), key).not.toBe("");
    expect(placeholders(sk[key]!), key).toBe(placeholders(text));
    expect(text, `en.${key}`).not.toMatch(banned);
    expect(sk[key], `sk.${key}`).not.toMatch(banned);
  }
});

it("keeps the comparison marks the same in both locales", () => {
  const pick = (locale: "en" | "sk") => getWelcomeStoryMessages(locale).compare.rows.map((row) => [row.u, row.s, row.t].join(""));
  expect(pick("sk")).toEqual(pick("en"));
});

it("keeps the Slovak copy translated", () => {
  const en = Object.fromEntries(leaves(getWelcomeStoryMessages("en")));
  const same = Object.entries(Object.fromEntries(leaves(getWelcomeStoryMessages("sk")))).filter(([key, value]) => en[key] === value && /[a-z]{4,}/i.test(value) && !codes.test(key)).map(([key]) => key);
  // Proper names and labels that stay the same in Slovak.
  const allowed = /^(plans\.plusTitle|areas\.chips\.plus|areas\.previewGroups\.etfs|areas\.items\.etfs\.title|open\.sources\.\d+\.name|compare\.colUs|scanner\.colGroups)$/;
  expect(same.filter((key) => !allowed.test(key))).toEqual([]);
});
