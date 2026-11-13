import { expect, it } from "vitest";
import { getPathMessages } from "./path-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

it("has the same keys, non-empty text and matching placeholders in EN and SK", () => {
  const en = leaves(getPathMessages("en"));
  const sk = Object.fromEntries(leaves(getPathMessages("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key]!.trim(), key).not.toBe("");
    expect(placeholders(sk[key]!), key).toBe(placeholders(text));
  }
});

it("names the paths active and passive investor, never trader, and carries no price digits or advice wording", () => {
  expect(getPathMessages("en").paths.active.name).toBe("Active investor");
  expect(getPathMessages("en").paths.passive.name).toBe("Passive investor");
  expect(getPathMessages("sk").paths.active.name).toBe("Aktívny investor");
  expect(getPathMessages("sk").paths.passive.name).toBe("Pasívny investor");
  const banned = /trader|obchodník|beat the market|guarantee|\breturns?\b|\bbuy\b|\bsell\b|\bbest\b|recommend|limited time|act now|hurry|poraz\w* trh|zaručen|\bvýnos\w*|\bkúp\w*|predaj|\bnajlepš\w*|odporúč/i;
  for (const locale of ["en", "sk"] as const) {
    for (const [key, value] of leaves(getPathMessages(locale))) {
      expect(value, `${locale}.${key}`).not.toMatch(/\d|EUR|€|\$/);
      expect(value, `${locale}.${key}`).not.toMatch(banned);
    }
  }
});
