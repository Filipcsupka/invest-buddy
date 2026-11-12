import { expect, it } from "vitest";
import { isVendorSourceUrl } from "./source-url";

it.each(["https://eodhd.com/x", "https://www.eodhd.com/x", "https://api.eodhistoricaldata.com/x"])("identifies a vendor source host: %s", (url) => {
  expect(isVendorSourceUrl(url)).toBe(true);
});
it.each(["https://issuer.example.com/eodhd.com", "https://eodhd.com.example.com/x", "invalid"])("keeps other hosts separate: %s", (url) => {
  expect(isVendorSourceUrl(url)).toBe(false);
});
