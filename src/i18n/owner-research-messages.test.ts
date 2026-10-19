import { describe, expect, it } from "vitest";
import { ownerResearchMessages } from "./owner-research-messages";

type Tree = { [key: string]: string | Tree };
const leaves = (tree: Tree, prefix = ""): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
};
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("owner research messages (P7)", () => {
  const en = leaves(ownerResearchMessages.en as unknown as Tree);
  const sk = leaves(ownerResearchMessages.sk as unknown as Tree);

  it("have the same keys and placeholders in both locales", () => {
    expect([...sk.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, value] of en) expect(placeholders(sk.get(key) ?? ""), key).toEqual(placeholders(value));
  });

  it("have no empty strings, dashes, amounts or filler words", () => {
    for (const [key, value] of [...en, ...sk]) {
      expect(value.trim(), key).not.toBe("");
      expect(value, key).not.toMatch(/[–—]|EUR|€|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i);
    }
  });
});
