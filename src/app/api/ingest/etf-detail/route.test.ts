import { expect, it } from "vitest";
import spy from "../../../../jobs/fixtures/eodhd-etf/spy-etf.json";
import { validateEtfDetail } from "./route";

it("accepts a captured ETF payload and rejects bad keys, symbols and non-ETF types", () => {
  expect(validateEtfDetail({ listingKey: "NYSEARCA:SPY", vendorSymbol: "SPY.US", data: spy }).errors).toEqual([]);
  expect(validateEtfDetail({ listingKey: "x", vendorSymbol: "SPY", data: spy }).errors).toEqual(["$.listingKey: invalid", "$.vendorSymbol: invalid"]);
  expect(validateEtfDetail({ listingKey: "NYSEARCA:SPY", vendorSymbol: "SPY.US", data: {} }).errors).toEqual(["$.data.ETF_Data: missing"]);
  expect(validateEtfDetail({ listingKey: "NYSEARCA:SPY", vendorSymbol: "SPY.US", data: { ...spy, General: { Type: "Common Stock" } } }).errors).toEqual(["$.data.General.Type: not an ETF"]);
  expect(validateEtfDetail(null).errors.length).toBe(2);
});
