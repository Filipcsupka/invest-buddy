import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const enabled = vi.fn();
const data = vi.fn();
vi.mock("@/data/owner-allocation", () => ({ ownerViewEnabled: () => enabled(), ownerAllocation: () => data() }));

import OwnerAllocationPage, * as page from "./page";

const props = (locale = "en") => ({ params: Promise.resolve({ locale }) });
afterEach(() => { enabled.mockReset(); data.mockReset(); });

describe("owner allocation page", () => {
  it("404s unless its private flag is on, before reading account data", async () => {
    enabled.mockReturnValue(false);
    await expect(OwnerAllocationPage(props())).rejects.toThrow(/404|NOT_FOUND/);
    expect(data).not.toHaveBeenCalled();
    expect(page.dynamic).toBe("force-dynamic");
    expect((await page.generateMetadata(props())).robots).toEqual({ index: false, follow: false });
  });

  it("shows EUR amounts and their reasons in English and Slovak", async () => {
    enabled.mockReturnValue(true);
    data.mockResolvedValue({ sample: false, baseline: { asOf: "2026-10-06", cashEur: 200, monthlyContributionEur: 200 }, result: {
      reserveEur: 66.67, carriedCashEur: 160, cashDrag: false,
      suggestions: [{ symbol: "NVDA", tier: "STARTER", amountEur: 40, reason: "TIER_AMOUNT", capped: false }],
    } });
    const en = renderToStaticMarkup(await OwnerAllocationPage(props()));
    expect(en).toContain("40.00 EUR");
    expect(en).toContain("Tier share of starting free cash.");
    const sk = renderToStaticMarkup(await OwnerAllocationPage(props("sk")));
    expect(sk).toContain("40,00 EUR");
    expect(sk).toContain("Podiel stupňa na počiatočnej voľnej hotovosti.");
  });
  it("keeps sale proceeds and holding facts on the private owner page", async () => {
    enabled.mockReturnValue(true);
    data.mockResolvedValue({ sample: false, baseline: { asOf: "2026-09-30", cashEur: 100, monthlyContributionEur: 200 }, result: {
      reserveEur: 0, carriedCashEur: 60, recycledCashEur: 20, cashDrag: false,
      suggestions: [{ symbol: "LONG", tier: "STARTER", amountEur: 40, recycledEur: 40, reason: "TIER_AMOUNT", capped: false }],
    }, sales: [{ date: "2026-09-01", symbol: "EVENT", netProceedsEur: 100, remainingEur: 60 }],
    holdings: [{ symbol: "LONG", gainFromCostPercent: 25, daysHeld: 15 }] });
    const html = renderToStaticMarkup(await OwnerAllocationPage(props()));
    expect(html).toContain("Sale proceeds ledger");
    expect(html).toContain("100.00 EUR");
    expect(html).toContain("Holding facts");
    expect(html).toContain("25.00%");
    expect(html).toContain("Days held");
  });
});
