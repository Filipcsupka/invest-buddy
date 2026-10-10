import { afterEach, describe, expect, it } from "vitest";
import sitemap, { dynamic } from "./sitemap";

describe("sitemap", () => {
  const originalAdvice = process.env.ADVICE_OUTPUT;
  afterEach(() => { if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });
  it("reads the legal flag at request time", () => expect(dynamic).toBe("force-dynamic"));
  it("lists the canonical stock screen in both locales without the retired scanner URL", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/en/dashboard"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/sk/dashboard"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/scanner"))).toBe(false);
  });
  it("omits sizing until ADVICE_OUTPUT is on", () => {
    process.env.ADVICE_OUTPUT = "off";
    expect(sitemap().some((entry) => entry.url.endsWith("/sizing"))).toBe(false);
    process.env.ADVICE_OUTPUT = "on";
    expect(sitemap().filter((entry) => entry.url.endsWith("/sizing"))).toHaveLength(2);
  });
});
