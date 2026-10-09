import { describe, expect, it } from "vitest";
import Scanner from "./page";

describe("scanner route", () => {
  it("returns not found for each locale", async () => {
    for (const locale of ["en", "sk"]) {
      try {
        await Scanner({ params: Promise.resolve({ locale }) });
        throw new Error("Missing 404");
      } catch (error) {
        expect((error as { digest: string }).digest).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
      }
    }
  });
});
