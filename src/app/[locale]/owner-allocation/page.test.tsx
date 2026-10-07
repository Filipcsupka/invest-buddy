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
});
