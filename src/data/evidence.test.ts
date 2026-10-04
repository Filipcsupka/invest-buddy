import { expect, it } from "vitest";
import { fixtureVerifier, offVerifier } from "./evidence";
const evidence = { claim: "fundamentals.guidanceRaised", url: "https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx", publishedAt: "2026-08-01", fiscalPeriod: "Q2 FY2027", quote: "NVIDIA announced revenue growth in its latest quarterly results." };
it("checks field freshness without network in fixture mode", async () => {
  expect(await fixtureVerifier(evidence, "2026-10-04")).toBe(true);
  expect(await fixtureVerifier(evidence, "2026-12-01")).toBe(false);
  expect(await offVerifier({ ...evidence, fiscalPeriod: undefined }, "2026-10-04")).toBe(false);
});
