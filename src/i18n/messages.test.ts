import { describe, expect, it } from "vitest";
import { messages } from "./messages";
import { fill, formatDate, formatNumber, formatPercent, negotiateLocale, plural } from "./index";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const banned = /[–—]|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i;

describe("dictionaries", () => {
  const en = leaves(messages.en as unknown as Tree);
  const sk = leaves(messages.sk as unknown as Tree);

  it("have the same keys in both locales", () => {
    expect([...sk.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("have no empty strings except the optional operator disclosure", () => {
    for (const [key, value] of [...en, ...sk]) if (key !== "common.operatorDisclosure") expect(value.trim(), key).not.toBe("");
  });

  it("use the same placeholders in both locales", () => {
    for (const [key, value] of en) expect(placeholders(sk.get(key) ?? ""), key).toEqual(placeholders(value));
  });

  it("has no English fallback in the Slovak dictionary", () => {
    // Slovak values equal to English only for names, codes and loanwords listed here.
    const same = new Set(["meta.siteName", "meta.companyTitle", "sources.kinds.form4", "sectors.Fintech", "table.ticker", "trackRecord.ticker", "insiders.ticker", "insiders.insider", "ownerAllocation.symbol", "portfolio.symbol", "ideas.headline", "ideas.headlinePublic", "ideas.headlineTier", "ideas.model", "plurals.tickers.one"]);
    for (const [key, value] of sk) if (value === en.get(key) && /[A-Za-z]{4,}/.test(value)) expect(same.has(key), `${key} is still English: ${value}`).toBe(true);
    const stopwords = /\b(the|and|with|from|this|that|your|you|are|not|for)\b/i;
    for (const [key, value] of sk) expect(stopwords.test(value.replace(/\{\w+\}/g, "")), `${key}: ${value}`).toBe(false);
  });

  it("uses one Slovak term per concept", () => {
    const outdated = /\b(dáta|dát|dátach|dátový|benchmark|Nastavenie splnené|Porušené kritériá|titul)\b/i;
    for (const [key, value] of sk) expect(outdated.test(value), `${key}: ${value}`).toBe(false);
  });

  it("names each rule state the same way everywhere", () => {
    for (const m of [messages.en, messages.sk]) for (const key of ["broken", "ignore", "wait", "watch", "setup", "insufficient"] as const) expect(m.states[key]).toBe(m.status.labels[key]);
  });

  it("keep dashes and stock filler words out of copy", () => {
    for (const [key, value] of [...en, ...sk]) expect(banned.test(value), `${key}: ${value}`).toBe(false);
  });
});

describe("status and company wording", () => {
  it("keeps buy, sell, recommend and opportunity words out of status.* and company.* except the held-back Buy zone label", () => {
    const words = /\b(buy|sell|recommend\w*|opportunit\w*|kúpiť|predať|odporúč\w*|príležitosť|príležitost\w*)\b/i;
    for (const [key, value] of [...leaves(messages.en as unknown as Tree), ...leaves(messages.sk as unknown as Tree)]) {
      if (!/^(status|company)\./.test(key)) continue;
      // Held back by ADVICE_OUTPUT (docs/wording-gate.md), and the existing "not personal advice" disclaimer.
      if (key === "status.advice.setup" || key === "status.headlineAdvice.setup" || key === "company.ideaNote") continue;
      expect(words.test(value), `${key}: ${value}`).toBe(false);
    }
  });
});

describe("formatting", () => {
  it("uses a decimal comma in Slovak", () => {
    expect(formatNumber("sk", 1234.5, 2)).toMatch(/^1\s?234,50$/);
    expect(formatNumber("en", 1234.5, 2)).toBe("1,234.50");
    expect(formatPercent("sk", 0.062)).toMatch(/^6,2\s%$/);
  });

  it("formats session dates in UTC", () => {
    expect(formatDate("en", "2025-08-08")).toBe("8 Aug 2025");
    expect(formatDate("sk", "2025-08-08")).toMatch(/^8\.\s?8\.\s?2025$/);
  });

  it("picks Slovak plural forms", () => {
    const forms = messages.sk.plurals.tickers;
    expect(plural("sk", forms, 1)).toBe("1 ticker");
    expect(plural("sk", forms, 3)).toBe("3 tickery");
    expect(plural("sk", forms, 35)).toBe("35 tickerov");
  });

  it("fills placeholders", () => {
    expect(fill("{a} of {b}", { a: 1, b: 2 })).toBe("1 of 2");
  });
});

describe("negotiateLocale", () => {
  it("defaults to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("de-DE,fr;q=0.8")).toBe("en");
  });
  it("respects quality values and maps Czech to Slovak", () => {
    expect(negotiateLocale("sk-SK,sk;q=0.9,en;q=0.8")).toBe("sk");
    expect(negotiateLocale("en;q=0.5,cs;q=0.9")).toBe("sk");
    expect(negotiateLocale("en-US,en;q=0.9,sk;q=0.8")).toBe("en");
  });
});

describe("status strings", () => {
  const en = leaves(messages.en as unknown as Tree);
  const sk = leaves(messages.sk as unknown as Tree);
  it("exist in both locales with the same keys", () => {
    const keys = (m: Map<string, string>) => [...m.keys()].filter((k) => k.startsWith("status.")).sort();
    expect(keys(en).length).toBeGreaterThan(20);
    expect(keys(sk)).toEqual(keys(en));
  });
  it("keep action wording out of the flag-off labels", () => {
    for (const [key, value] of [...en, ...sk]) if (key.startsWith("status.labels.") || key.startsWith("status.headline.")) expect(value, key).not.toMatch(/buy|nákup|zone|zóna/i);
  });
});
