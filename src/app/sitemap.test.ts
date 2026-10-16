import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sitemap, { dynamic } from "./sitemap";
import { instruments } from "@/data/fixtures";

describe("sitemap", () => {
  const original = { advice: process.env.ADVICE_OUTPUT, mode: process.env.DATA_MODE };
  beforeEach(() => { process.env.DATA_MODE = "fixture"; });
  afterEach(() => {
    if (original.advice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = original.advice;
    if (original.mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = original.mode;
  });
  it("reads the legal flag at request time", () => expect(dynamic).toBe("force-dynamic"));
  it("lists the dashboard, scanner and heat map in both locales", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const path of ["dashboard", "scanner", "heatmap"]) {
      expect(urls.some((url) => url.endsWith(`/en/${path}`)), path).toBe(true);
      expect(urls.some((url) => url.endsWith(`/sk/${path}`)), path).toBe(true);
    }
  });
  it("lists no filtered, preview or query URL", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.filter((url) => url.includes("?") || url.includes("view="))).toEqual([]);
  });
  it("omits sizing until ADVICE_OUTPUT is on", async () => {
    process.env.ADVICE_OUTPUT = "off";
    expect((await sitemap()).some((entry) => entry.url.endsWith("/sizing"))).toBe(false);
    process.env.ADVICE_OUTPUT = "on";
    expect((await sitemap()).filter((entry) => entry.url.endsWith("/sizing"))).toHaveLength(2);
  });
  it("lists one company page per instrument and locale", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const { ticker } of instruments) {
      expect(urls.filter((url) => url.endsWith(`/en/company/${ticker}`))).toHaveLength(1);
      expect(urls.filter((url) => url.endsWith(`/sk/company/${ticker}`))).toHaveLength(1);
    }
    expect(urls.filter((url) => url.includes("/company/"))).toHaveLength(instruments.length * 2);
  });
  it("dates every entry from the data and links both languages", async () => {
    for (const entry of await sitemap()) {
      expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}/);
      const languages = entry.alternates?.languages as Record<string, string>;
      expect(Object.keys(languages).sort()).toEqual(["en-GB", "sk-SK", "x-default"]);
      expect(languages["x-default"]).toBe(languages["en-GB"]);
    }
  });
});
