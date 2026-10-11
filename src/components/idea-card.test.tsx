import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdeaCard } from "./idea-card";
import { ideasEnabled } from "../data/ideas-store";
import { sampleIdeas } from "../ideas/fixtures";

const [add, watch] = sampleIdeas;
const originalAdvice = process.env.ADVICE_OUTPUT;
beforeEach(() => { process.env.ADVICE_OUTPUT = "on"; });
afterEach(() => { if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });
const html = (idea = add, locale: "en" | "sk" = "en") => renderToStaticMarkup(<IdeaCard idea={idea} locale={locale} showAmounts />);

it.each(["en", "sk"] as const)("hides actions, size tiers, plans and amounts when ADVICE_OUTPUT is off (%s)", (locale) => {
  process.env.ADVICE_OUTPUT = "off";
  const out = renderToStaticMarkup(<IdeaCard idea={add} locale={locale} stateLabel={locale === "en" ? "Conditions met" : "Podmienky splnené"} />);
  expect(out).toContain("NVDA");
  expect(out).toContain("example.com");
  expect(out).toContain("Sample earnings release");
  expect(out).toContain("Sample 10-Q");
  expect(out).not.toMatch(/Add|Start position|Prikúpiť|Otvoriť pozíciu|EUR|€|data-action|data-tier|Opportunity cost|Príležitosť/);
});

it("shows only known document labels while preserving every source link", () => {
  process.env.ADVICE_OUTPUT = "off";
  const blocked = ["Buy EUR 50 now", "HIGH_CONVICTION_ADD", "STARTER", "STANDARD", "FULL", "Accumulate NVDA now", "Increase exposure 5%", "Sample 10-Q Buy"];
  const idea = { ...add, evidence: blocked.map((label, index) => ({ url: `https://example.com/source-${index}`, label })) };
  const out = html(idea);
  blocked.forEach((label, index) => {
    expect(out).toContain(`href="https://example.com/source-${index}"`);
    expect(out).toContain(`Evidence ${index + 1} · example.com`);
    expect(out).not.toContain(label);
  });
});

describe("idea card", () => {
  it("shows the alert layout in order, with the headline and evidence links", () => {
    const out = html();
    expect(out).toContain("NVDA - Add - EUR 60-90");
    expect(out).toContain("Add about 1/3 of a full position");
    const order = ["What happened", "Why it matters", "Setup", "Numbers", "Plan", "Evidence"].map((t) => out.indexOf(`>${t}<`));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain("Company");
    expect(out).toContain("Very strong");
    expect(out).toContain("Add or upgrade trigger");
    expect(out).toContain("Opportunity cost");
    expect(out).toContain('href="https://example.com/nvda-release"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('aria-labelledby="idea-2-title"');
    expect(out).not.toContain("UNCONFIRMED");
  });
  it("marks an unconfirmed idea and carried data, and has no evidence block when there are no links", () => {
    const out = html(watch);
    expect(out).toContain("AMD - Watch - EUR 0-0");
    expect(out).toContain("UNCONFIRMED");
    expect(out).toContain("Carried data from");
    expect(out).toContain("RULES CONFLICT");
    expect(out).toContain("Downgraded from Start position");
    expect(out).toContain("Conflict noted: Sample");
    expect(out).not.toContain(">Evidence<");
  });
  it("renders the same card in Slovak", () => {
    const out = html(add, "sk");
    expect(out).toContain("Čo sa stalo");
    expect(out).toContain("Veľmi silné");
    expect(out).toContain("NVDA - Prikúpiť - EUR 60-90");
    expect(html(watch, "sk")).toContain("NEPOTVRDENÉ");
    expect(html(watch, "sk")).toContain("KONFLIKT PRAVIDIEL");
  });
  it("uses translated body in Slovak and canonical English in English", () => {
    const translated = { ...add, translations: { sk: { verdict: "Slovenský verdikt", whatHappened: ["Slovenský fakt", "Druhý fakt"], whyItMatters: ["Slovenský dôvod"], numbers: [{ label: "Skóre", value: "19" }], plan: { ...add.plan, trigger: "Slovenský spúšťač" }, evidence: [{ url: "https://example.com/nvda-release", label: "Tlačová správa" }] } } };
    expect(html(translated, "sk")).toContain("Slovenský verdikt");
    expect(html(translated, "sk")).toContain("Slovenský spúšťač");
    expect(html(translated, "en")).toContain(add.verdict);
    expect(html(translated, "en")).not.toContain("Slovenský verdikt");
    expect(html(add, "sk")).toContain("Preklad nie je dostupný");
    expect(html(translated, "sk")).not.toContain("Preklad nie je dostupný");
    expect(renderToStaticMarkup(<IdeaCard idea={translated} locale="sk" showAmounts={false} />)).not.toMatch(/EUR|€/);
  });
  it("keeps the English conflict when a translation omits it", () => {
    const translated = { ...watch, translations: { sk: { verdict: "Preklad", whatHappened: watch.whatHappened, whyItMatters: watch.whyItMatters, numbers: watch.numbers, plan: watch.plan, evidence: watch.evidence } } };
    const out = html(translated, "sk");
    expect(out).toContain("Sample");
    expect(out).toContain("Preklad nie je dostupný");
  });
  it("shows each language’s downgrade reason", () => {
    const translated = { ...watch, translations: { en: { downgradeReason: "Guidance fell." }, sk: { verdict: "Preklad", whatHappened: watch.whatHappened, whyItMatters: watch.whyItMatters, numbers: watch.numbers, plan: watch.plan, evidence: watch.evidence, downgradeReason: "Výhľad klesol." } } };
    expect(html(translated, "en")).toContain("Guidance fell.");
    expect(html(translated, "sk")).toContain("Výhľad klesol.");
  });
  it("replaces stored codes in Slovak judge text and keeps English fallback text untouched", () => {
    const sk = { verdict: "WATCH, žiadne nové peniaze.", whatHappened: ["Fakt jedna", "Fakt dva"], whyItMatters: ["Entry je Strong."], numbers: add.numbers, plan: add.plan, evidence: [{ url: "https://example.com/nvda-release", label: "Earnings release" }] };
    const out = html({ ...add, translations: { sk } }, "sk");
    expect(out).toContain("Sledovať, žiadne nové peniaze.");
    expect(out).toContain("Vstup je Silné.");
    expect(out).toContain("Výsledková správa");
    expect(out).not.toContain("WATCH");
    expect(html({ ...add, whyItMatters: ["Entry is Strong."] }, "sk")).toContain("Entry is Strong.");
  });
  it("escapes model text", () => {
    expect(html({ ...add, verdict: "<script>alert(1)</script>" })).not.toContain("<script>");
  });
});

describe("idea card without amounts (ADR-001)", () => {
  it("shows the tier and its wording in the headline and the plan, never EUR", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={add} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - Add 1/3<");
    expect(out).toContain("Add about 1/3 of a full position");
    expect(out).toContain("Not an amount and not tailored to you.");
    expect(out).not.toMatch(/EUR|€|Amount now/);
    const watchOut = renderToStaticMarkup(<IdeaCard idea={watch} locale="en" showAmounts={false} />);
    expect(watchOut).toContain("AMD - Watch<");
    expect(watchOut).toContain("No new money");
    expect(renderToStaticMarkup(<IdeaCard idea={add} locale="sk" showAmounts={false} />)).toContain("NVDA - Prikúpiť 1/3<");
  });
  it("an idea stored before tiers shows no size", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={{ ...add, sizeTier: null }} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - Add<");
    expect(out).not.toContain(">Size<");
  });
  it("drops the band, amountNow and every sentence naming EUR", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={{ ...add, verdict: "Setup holds. Buy EUR 80 now.", numbers: [...add.numbers, { label: "Size", value: "EUR 80" }] }} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - Add 1/3<");
    expect(out).toContain("Setup holds.");
    expect(out).toContain("Opportunity cost");
    expect(out).not.toMatch(/EUR|€|Amount now|Cash left/);
  });
  it("strips euro-sign wording in Slovak too", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={{ ...add, plan: { ...add.plan, trigger: "Pridať 50 € pri páde." } }} locale="sk" showAmounts={false} />);
    expect(out).not.toMatch(/EUR|€|Suma teraz/);
  });
});

describe("ideas page gate", () => {
  it("is hidden unless IDEAS_PAGE=on or the app runs on fixture data", () => {
    const keep = { page: process.env.IDEAS_PAGE, mode: process.env.DATA_MODE };
    delete process.env.IDEAS_PAGE; delete process.env.DATA_MODE;
    expect(ideasEnabled()).toBe(false);
    process.env.IDEAS_PAGE = "on";
    expect(ideasEnabled()).toBe(true);
    delete process.env.IDEAS_PAGE; process.env.DATA_MODE = "fixture";
    expect(ideasEnabled()).toBe(true);
    for (const [k, v] of [["IDEAS_PAGE", keep.page], ["DATA_MODE", keep.mode]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
});
