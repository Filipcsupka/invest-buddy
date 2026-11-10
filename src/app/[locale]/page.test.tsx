import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instruments } from "@/data/fixtures";
import { SAMPLE_COMPANIES, sampleRows, specimenRow } from "@/components/welcome/sample-data";
import { storySteps } from "@/components/welcome/sections";

const scores = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => { throw new Error("headers() must not be read on the Welcome page"); }, cookies: async () => { throw new Error("cookies() must not be read on the Welcome page"); } }));
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
import Welcome from "./(marketing)/page";

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
const render = async (locale: string) => renderToStaticMarkup(await Welcome(props(locale)));
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\u00a0/g, " ").replace(/\s+/g, " ");
const original = { waitlist: process.env.WAITLIST, privateUse: process.env.EODHD_PRIVATE_USE };
afterEach(() => {
  scores.mockReset();
  for (const [key, env] of [["WAITLIST", original.waitlist], ["EODHD_PRIVATE_USE", original.privateUse]] as const) if (env === undefined) delete process.env[key]; else process.env[key] = env;
});

/** Banned in public copy: action words, urgency and return claims (ADR-001, docs/wording-gate.md, welcome brief s2). */
const BANNED = /\bbuy\b|\bsell\b|\bpick(s|ed)?\b|recommend|best stocks|\bstrong\b|opportunit|upside|beat the market|guarantee|don't miss|limited time|act now|hurry|last chance|\bkúp\w*|\bpredaj\w*|odporúča|príležitos|zaručen|nenechajte si ujsť|obmedzený čas/i;

describe.each(["en", "sk"])("Welcome (%s)", (locale) => {
  it("reads no store, no headers and no cookies, so the HTML is the same for every visitor", async () => {
    process.env.EODHD_PRIVATE_USE = "on";
    const a = await render(locale);
    const b = await render(locale);
    expect(scores).not.toHaveBeenCalled();
    expect(a).toBe(b);
  });

  it("shows the sample board with a SAMPLE stamp and a per-row sample mark", async () => {
    const html = await render(locale);
    expect(html).toContain(locale === "en" ? "Sample data, not live scores" : "Ukážkové údaje, nie živé skóre");
    const rowMark = locale === "en" ? ">Sample<" : ">Ukážka<";
    expect(html.split(rowMark).length - 1).toBeGreaterThanOrEqual(5);
    for (const row of sampleRows().slice(0, 5)) expect(html).toContain(row.company.name);
    expect(html).not.toMatch(/No data yet|Zatiaľ tu nie sú údaje/);
  });

  it("puts no synthetic figure under a real company name and no vendor name on the page", async () => {
    const page = text(await render(locale));
    for (const instrument of instruments) {
      if (instrument.name.length > 3) expect(page, instrument.name).not.toContain(instrument.name);
      expect(page, instrument.ticker).not.toMatch(new RegExp(`\\b${instrument.ticker}\\b(?=\\s+(Sample|Ukážka))`));
    }
    expect(page).not.toMatch(/EODHD|Twelve Data|Alpha Vantage|Tiingo|Finnhub|Polygon|Massive/);
  });

  it("uses the locale's decimal mark for sample scores", async () => {
    const html = await render(locale);
    const top = sampleRows()[0]!.percent!;
    const shown = locale === "sk" ? String(top).replace(".", ",") : String(top);
    expect(html).toContain(shown);
  });

  it("passes the wording gate and keeps the ADR-001 line next to scores", async () => {
    const html = await render(locale);
    expect(text(html)).not.toMatch(BANNED);
    expect(html).toContain(locale === "en" ? "Informational screening only" : "Iba informačný prehľad");
    expect(html).not.toMatch(/Buy zone|Zóna nákupu/);
  });

  it("has one h1, no skipped heading level, named sections and labelled controls", async () => {
    const html = await render(locale);
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
    for (const section of html.match(/<section[^>]*>/g) ?? []) expect(section).toMatch(/aria-label(ledby)?=/);
    for (const input of html.match(/<input[^>]*>/g) ?? []) if (!/type="checkbox"/.test(input)) expect(input).toMatch(/id="[^"]+"/);
    for (const svg of html.match(/<svg[^>]*>/g) ?? []) expect(svg).toMatch(/aria-hidden="true"|role="img"/);
  });

  it("offers sign-up with email and a new password, and no Google button, ready for password managers", async () => {
    const html = await render(locale);
    expect(html).not.toMatch(/Google/);
    expect(html).toContain('name="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain(`href="/${locale}/sign-in?next=`);
  });
});

it("always links the plans, reads no build flag, and shows the planned Plus price", async () => {
  delete process.env.WAITLIST;
  const off = await render("en");
  expect(off).toContain('href="/en/pricing"');
  process.env.WAITLIST = "on";
  expect(await render("en")).toBe(off);
  const en = text(off);
  const sk = text(await render("sk"));
  expect(en).toContain("€9.90 per month");
  expect(en).toContain("€99 per year");
  expect(sk).toContain("9,90 € mesačne");
});

it("keeps the sample universe invented and the story honest", () => {
  const real = new Set(instruments.map((i) => i.ticker));
  for (const company of SAMPLE_COMPANIES) {
    expect(real.has(company.ticker), company.ticker).toBe(false);
    expect(instruments.some((i) => i.name === company.name), company.name).toBe(false);
  }
  // The last step of the scroll story equals the engine's own display score for the specimen.
  const row = specimenRow();
  const { steps } = storySteps(row);
  expect(steps.at(-1)!.percent).toBe(Math.round(row.percent! * 10) / 10);
  expect(steps.map((s) => s.earned)).toEqual([...steps.map((s) => s.earned)].sort((a, b) => a - b));
});

it("never imports a request API or the data store in the Welcome page source", () => {
  const source = readFileSync("src/app/[locale]/(marketing)/page.tsx", "utf8");
  expect(source).not.toMatch(/next\/headers|@\/data\/store|withPageLog|force-dynamic/);
});
