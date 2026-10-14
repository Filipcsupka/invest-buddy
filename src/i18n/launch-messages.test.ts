import { expect, it } from "vitest";
import { getLaunchMessages, type LaunchMessages } from "./launch-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

it("has the same keys, non-empty text and matching placeholders in EN and SK", () => {
  const en = leaves(getLaunchMessages("en"));
  const sk = Object.fromEntries(leaves(getLaunchMessages("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key].trim(), key).not.toBe("");
    expect(placeholders(sk[key]), key).toBe(placeholders(text));
  }
});

it("uses no em dashes or urgency wording", () => {
  const text = [...leaves(getLaunchMessages("en")), ...leaves(getLaunchMessages("sk"))].map(([, value]) => value).join("\n");
  expect(text).not.toContain("—");
  expect(text).not.toMatch(/limited time|act now|lifetime|doživotn/i);
});

it("keeps the consent version in both locales", () => {
  const read = (m: LaunchMessages) => m.form.consentVersion;
  expect(read(getLaunchMessages("en"))).toBe(read(getLaunchMessages("sk")));
});
