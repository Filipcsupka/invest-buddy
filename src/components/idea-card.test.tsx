import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdeaCard } from "./idea-card";
import { ideasEnabled } from "../data/ideas-store";
import { sampleIdeas } from "../ideas/fixtures";

const [add, watch] = sampleIdeas;
const html = (idea = add, locale: "en" | "sk" = "en") => renderToStaticMarkup(<IdeaCard idea={idea} locale={locale} />);

describe("idea card", () => {
  it("shows the alert layout in order, with the headline and evidence links", () => {
    const out = html();
    expect(out).toContain("NVDA - ADD - EUR 60-90");
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
    expect(out).toContain("AMD - WATCH - EUR 0-0");
    expect(out).toContain("UNCONFIRMED");
    expect(out).toContain("Carried data from");
    expect(out).toContain("RULES CONFLICT");
    expect(out).toContain("Downgraded from START_POSITION");
    expect(out).toContain("Conflict noted: Sample");
    expect(out).not.toContain(">Evidence<");
  });
  it("renders the same card in Slovak", () => {
    const out = html(add, "sk");
    expect(out).toContain("Čo sa stalo");
    expect(out).toContain("Veľmi silné");
    expect(out).toContain("NVDA - ADD - EUR 60-90");
    expect(html(watch, "sk")).toContain("NEPOTVRDENÉ");
    expect(html(watch, "sk")).toContain("KONFLIKT PRAVIDIEL");
  });
  it("escapes model text", () => {
    expect(html({ ...add, verdict: "<script>alert(1)</script>" })).not.toContain("<script>");
  });
});

describe("idea card without amounts (ADR-001)", () => {
  it("shows the tier and its wording in the headline and the plan, never EUR", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={add} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - ADD - Add 1/3<");
    expect(out).toContain("Add about 1/3 of a full position");
    expect(out).toContain("Not an amount and not tailored to you.");
    expect(out).not.toMatch(/EUR|€|Amount now/);
    const watchOut = renderToStaticMarkup(<IdeaCard idea={watch} locale="en" showAmounts={false} />);
    expect(watchOut).toContain("AMD - WATCH<");
    expect(watchOut).toContain("No new money");
    expect(renderToStaticMarkup(<IdeaCard idea={add} locale="sk" showAmounts={false} />)).toContain("NVDA - ADD - Prikúpiť 1/3<");
  });
  it("an idea stored before tiers shows no size", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={{ ...add, sizeTier: null }} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - ADD<");
    expect(out).not.toContain(">Size<");
  });
  it("drops the band, amountNow and every sentence naming EUR", () => {
    const out = renderToStaticMarkup(<IdeaCard idea={{ ...add, verdict: "Setup holds. Buy EUR 80 now.", numbers: [...add.numbers, { label: "Size", value: "EUR 80" }] }} locale="en" showAmounts={false} />);
    expect(out).toContain("NVDA - ADD - Add 1/3<");
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
