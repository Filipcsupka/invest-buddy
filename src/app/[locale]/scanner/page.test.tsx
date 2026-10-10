import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Scanner, { generateMetadata } from "./page";

describe("scanner route", () => {
  it("returns not found for each locale", async () => {
    const previous = process.env.PAYWALL;
    process.env.PAYWALL = "off";
    for (const locale of ["en", "sk"]) {
      try {
        await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) });
        throw new Error("Missing 404");
      } catch (error) {
        expect((error as { digest: string }).digest).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
      }
    }
    if (previous === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = previous;
  });

  it("renders a filtered fixture row and marks query URLs noindex", async () => {
    const paywall = process.env.PAYWALL;
    const mode = process.env.DATA_MODE;
    process.env.PAYWALL = "on";
    process.env.DATA_MODE = "fixture";
    try {
      const props = { params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ q: "NVDA" }) };
      const markup = renderToStaticMarkup(await Scanner(props));
      expect(markup).toContain('name="q"');
      expect(markup).toContain('value="NVDA"');
      expect(markup).toContain('data-paywall-candidate="scanner-rows-full"');
      expect(markup).toContain('href="/en/company/NVDA"');
      expect(markup).not.toContain('href="/en/company/AMD"');
      const metadata = await generateMetadata(props);
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBe("/en/scanner");
    } finally {
      if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
      if (mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = mode;
    }
  });
});
