import { describe, expect, it } from "vitest";
import { cardModeFromEnv, formatIdeaCard, TELEGRAM_LIMIT, type IdeaCardInput } from "./format";
import { sampleIdeas } from "../ideas/fixtures";
import type { StoredIdea } from "../db/ideas";

const nvda = sampleIdeas[0];
const base: IdeaCardInput = {
  ticker: "NVDA", locale: "en", site: "https://x.test", idea: nvda, mode: "public", adviceOutput: true,
  previous: { state: "Watch", points: 16 }, current: { state: "Setup met (>=18)", points: 17 },
  audit: { evidencedMax: 23, percent: 73.9, coverage: 92 },
};
const skIdea: StoredIdea = { ...nvda, translations: { sk: {
  verdict: "Základy držia.", whatHappened: ["Cena zatvorila 7,4 % pod 20-dňovým maximom.", "Správa o výsledkoch uvádza rast tržieb."], whyItMatters: ["Podmienka poklesu je splnená."],
  numbers: [{ label: "Skóre", value: "19 z 25" }, { label: "Pod maximom", value: "7,4 %" }, { label: "Rast tržieb", value: "zrýchľuje" }],
  plan: { amountNow: "EUR 60-90", trigger: "Nový overený katalyzátor.", invalidation: "Zníženie výhľadu.", opportunityCost: "Oproti CSPX je nastavenie silnejšie." },
  evidence: [{ url: "https://example.com/nvda-release", label: "Výsledková správa" }],
} } };

describe("formatIdeaCard", () => {
  it("renders every section, relative score line and links", () => {
    const text = formatIdeaCard(base);
    expect(text).toContain("🟢 <b>NVDA</b> · Conditions met");
    expect(text).toContain("Was: 🔵 Watching → Now: 🟢 Conditions met");
    expect(text).toContain("Score 17 of 23 evidenced (74 %), data coverage 92 %");
    expect(text).not.toContain("/ 25");
    for (const heading of ["What happened", "Why it matters", "Setup", "Numbers", "Plan", "Evidence"]) expect(text).toContain(`<b>${heading}</b>`);
    expect(text).toContain("Company: Very strong · Entry: Strong · Catalyst: Good");
    expect(text).toContain('<a href="https://example.com/nvda-release">Sample earnings release</a>');
    expect(text).toContain('<a href="https://x.test/en/company/NVDA">Open NVDA</a>');
    expect(text).toContain("not personal advice");
  });

  it("keeps the neutral label even with ADVICE_OUTPUT on", () => {
    expect(formatIdeaCard({ ...base, adviceOutput: true })).not.toContain("Buy zone");
  });

  it("shows a first rating when there is no previous band", () => {
    expect(formatIdeaCard({ ...base, previous: null })).toContain("First rating: 🟢 Conditions met");
  });

  it("falls back to plain points when the audit has no relative fields", () => {
    const text = formatIdeaCard({ ...base, audit: undefined });
    expect(text).toContain("Score 17 points");
    expect(text).not.toContain("evidenced");
  });

  it("public mode has no EUR amounts and no action words", () => {
    const text = formatIdeaCard({ ...base, idea: { ...nvda, plan: { ...nvda.plan, trigger: "Upgrade to HIGH_CONVICTION_ADD on a catalyst." }, whatHappened: ["Cost EUR 60 to build.", "The price closed 7.4% under its 20-day high.", "Revenue grew."] } });
    expect(text).not.toMatch(/EUR|€|START|\bADD\b|HIGH_CONVICTION|Start position|Add\b|When to (start|add|stop)/);
    expect(text).toContain("The price closed 7.4% under its 20-day high.");
    expect(text).toContain("<b>Invalidation:</b>");
  });

  it("public mode with ADVICE_OUTPUT off keeps only state, evidence, links and the disclaimer", () => {
    const text = formatIdeaCard({ ...base, adviceOutput: false });
    for (const heading of ["What happened", "Why it matters", "Setup", "Numbers", "Plan"]) expect(text).not.toContain(`<b>${heading}</b>`);
    expect(text).toContain("<b>Evidence</b>");
    expect(text).toContain("Open NVDA");
  });

  it("owner mode adds the action word, the EUR band and the plan steps", () => {
    const text = formatIdeaCard({ ...base, mode: "owner", adviceOutput: false });
    expect(text).toContain("🟢 <b>NVDA</b> · Conditions met · Add · EUR 60-90");
    for (const label of ["When to start", "When to add", "When to stop", "Opportunity cost"]) expect(text).toContain(`<b>${label}:</b>`);
    expect(text).toContain("EUR 60-90");
  });

  it("escapes HTML in model text, labels and urls", () => {
    const text = formatIdeaCard({ ...base, idea: { ...nvda,
      whatHappened: ["<script>alert(1)</script> & more", "Beat \"consensus\" > 5%"], numbers: [{ label: "A<B", value: "x&y" }, { label: "c", value: "1" }, { label: "d", value: "2" }],
      evidence: [{ url: "https://example.com/a?x=1&y=\"2\"", label: "<b>Filing</b>" }] } });
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(text).toContain("A&lt;B: x&amp;y");
    expect(text).toContain('<a href="https://example.com/a?x=1&amp;y=&quot;2&quot;">&lt;b&gt;Filing&lt;/b&gt;</a>');
  });

  it("uses the stored Slovak translation and falls back to English when it is missing", () => {
    const sk = formatIdeaCard({ ...base, locale: "sk", idea: skIdea });
    expect(sk).toContain("Skóre 17 z 23 doložených (74 %), pokrytie údajov 92 %");
    expect(sk).toContain("<b>Čo sa stalo</b>");
    expect(sk).toContain("Cena zatvorila 7,4 % pod 20-dňovým maximom.");
    expect(sk).toContain("Firma: Veľmi silné · Vstup: Silné · Katalyzátor: Dobré");
    expect(sk).toContain('<a href="https://example.com/nvda-release">Výsledková správa</a>');
    expect(sk).toContain("https://x.test/sk/company/NVDA");
    expect(formatIdeaCard({ ...base, locale: "sk" })).toContain("the price closed 7.4% under its 20-day high");
  });

  it("owner mode in Slovak uses Slovak action and plan labels", () => {
    const text = formatIdeaCard({ ...base, locale: "sk", idea: skIdea, mode: "owner" });
    expect(text).toContain("Prikúpiť · EUR 60-90");
    expect(text).toContain("<b>Kedy začať:</b> EUR 60-90");
  });

  it("drops lowest-priority sections first at 4096 characters and never cuts a link", () => {
    const long = "x".repeat(290);
    const idea: StoredIdea = { ...nvda,
      whatHappened: [long, long, long], whyItMatters: [long, long],
      numbers: [1, 2, 3, 4, 5].map((n) => ({ label: `n${n}`, value: long.slice(0, 70) })),
      plan: { amountNow: "", trigger: long, invalidation: long, opportunityCost: long },
      evidence: [1, 2, 3, 4].map((n) => ({ url: `https://example.com/doc/${n}?${"q".repeat(250)}`, label: long.slice(0, 110) })) };
    const full = formatIdeaCard({ ...base, idea });
    expect(full.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(full).not.toContain("<b>Numbers</b>");
    expect(full).toContain("<b>What happened</b>");
    // Evidence links stay whole: every opening anchor has its closing tag and the company link is present.
    expect((full.match(/<a /g) ?? []).length).toBe((full.match(/<\/a>/g) ?? []).length);
    expect(full).toContain("https://x.test/en/company/NVDA");
    // Short card is untouched.
    expect(formatIdeaCard(base)).toContain("<b>Numbers</b>");
  });

  it("drops evidence links from the end, whole, when sections alone are not enough", () => {
    const huge = "z".repeat(1000);
    const evidence = [1, 2, 3, 4, 5, 6].map((n) => ({ url: `https://example.com/${n}/${"a".repeat(480)}`, label: huge.slice(0, 120) }));
    const text = formatIdeaCard({ ...base, idea: { ...nvda, evidence }, ticker: "NVDA" });
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect((text.match(/<a /g) ?? []).length).toBe((text.match(/<\/a>/g) ?? []).length);
    expect(text.match(/https:\/\/example\.com\/\d\//g)?.length ?? 0).toBeLessThan(6);
    expect(text).toContain("https://example.com/1/");
    expect(text).toContain("https://x.test/en/company/NVDA");
  });
});

describe("cardModeFromEnv", () => {
  it("defaults to public and only 'owner' selects owner", () => {
    expect(cardModeFromEnv(undefined)).toBe("public");
    expect(cardModeFromEnv("")).toBe("public");
    expect(cardModeFromEnv("Owner ")).toBe("public");
    expect(cardModeFromEnv("owner")).toBe("owner");
  });
});
