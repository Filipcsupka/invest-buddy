import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";

// The viewer of each render: owner, Plus customer or free customer.
const who = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => who.viewer ?? real.resolveViewer() };
});
import Scanner from "./page";
import Dashboard from "../dashboard/page";

const owner: Viewer = { tier: "admin", preview: false, owner: true, userId: null };
const plus: Viewer = { tier: "paid", preview: false, owner: false, userId: "u1", plan: "plus" };
const free: Viewer = { tier: "free", preview: false, owner: false, userId: "u2", plan: "free" };
const scanner = async (locale = "en") => renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
const dashboard = async (locale = "en") => renderToStaticMarkup(await Dashboard({ params: Promise.resolve({ locale }) }));

describe("shortlist visibility", () => {
  const saved = { PAYWALL: process.env.PAYWALL, DATA_MODE: process.env.DATA_MODE, SHORTLIST_VIEW: process.env.SHORTLIST_VIEW };
  beforeEach(() => { process.env.PAYWALL = "on"; process.env.DATA_MODE = "fixture"; delete process.env.SHORTLIST_VIEW; });
  afterEach(() => {
    who.viewer = null;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });

  it.each([["owner", owner], ["Plus", plus]] as const)("shows the ranked, grouped shortlist to the %s viewer", async (_, viewer) => {
    who.viewer = viewer;
    const en = await scanner();
    expect(en).toContain('data-shortlist="full"');
    expect(en).toContain("Shortlist");
    expect(en).toContain("Sector concentration in this list");
    expect(en).toContain("Order decided by");
    expect(en).not.toContain('data-tier-lock="scanner-shortlist"');
    const sk = await scanner("sk");
    expect(sk).toContain("Užší výber");
    expect(await dashboard()).toContain('data-shortlist="compact"');
  });

  it("gives a free viewer the lock card and none of the shortlist rows", async () => {
    who.viewer = free;
    for (const html of [await scanner(), await dashboard()]) {
      expect(html).toContain('data-tier-lock="scanner-shortlist"');
      expect(html).not.toContain("data-shortlist=");
      expect(html).not.toContain("Order decided by");
    }
  });

  it("hides the block for everyone when SHORTLIST_VIEW is off", async () => {
    process.env.SHORTLIST_VIEW = "off";
    for (const viewer of [owner, plus, free]) {
      who.viewer = viewer;
      const html = await scanner();
      expect(html).not.toContain("data-shortlist=");
      expect(html).not.toContain("scanner-shortlist");
    }
  });

  it("uses no action wording, no amounts and no vendor name", async () => {
    who.viewer = plus;
    for (const locale of ["en", "sk"]) {
      const html = (await scanner(locale)).replace(/<[^>]+>/g, " ");
      const block = html.slice(html.indexOf(locale === "en" ? "Shortlist" : "Užší výber"));
      expect(block).not.toMatch(/\b(buy|sell|hold|you should|recommend\w*|kúpiť|predať|odporúč\w*)\b/i);
      expect(block).not.toMatch(/EUR|€/);
      expect(block).not.toMatch(/EODHD|Alpha Vantage|Twelve Data/i);
    }
  });
});
