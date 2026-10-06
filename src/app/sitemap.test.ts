import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the canonical stock screen in both locales without the retired scanner URL", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/en/dashboard"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/sk/dashboard"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/scanner"))).toBe(false);
  });
});
