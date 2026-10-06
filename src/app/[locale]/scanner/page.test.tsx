import { describe, expect, it } from "vitest";
import Scanner from "./page";

describe("scanner route", () => {
  it("permanently redirects each locale to the stock screen", async () => {
    for (const locale of ["en", "sk"]) {
      try {
        await Scanner({ params: Promise.resolve({ locale }) });
        throw new Error("Missing redirect");
      } catch (error) {
        expect((error as { digest: string }).digest).toContain(`NEXT_REDIRECT;replace;/${locale}/dashboard;308;`);
      }
    }
  });
});
