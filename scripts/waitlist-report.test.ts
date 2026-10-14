import { describe, expect, it } from "vitest";
import { buildReport } from "./waitlist-report";

describe("waitlist report", () => {
  it("sums counts by status, locale, source and variant, and holds no address", () => {
    const report = buildReport([
      { status: "confirmed", locale: "sk", source: "landing", priceVariant: "9.90", consentWeekly: true, count: 3 },
      { status: "confirmed", locale: "en", source: "pricing", priceVariant: "14", consentWeekly: false, count: 2 },
      { status: "pending", locale: "sk", source: "", priceVariant: "", consentWeekly: true, count: 4 },
    ]);
    expect(report).toEqual({
      total: 9,
      byStatus: { confirmed: 5, pending: 4 },
      byLocale: { sk: 7, en: 2 },
      bySource: { landing: 3, pricing: 2, "(none)": 4 },
      byPriceVariant: { "9.90": 3, "14": 2, "(none)": 4 },
      weeklyConsent: 3,
    });
    expect(JSON.stringify(report)).not.toContain("@");
  });
});
