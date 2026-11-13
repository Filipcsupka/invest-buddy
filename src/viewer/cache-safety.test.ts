import { afterEach, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { CUSTOMER_SESSION_COOKIE, hasCustomerCookie } from "@/auth/cookie";
import { canUseVendorData, requireFeature } from "./viewer";

const saved = { privateUse: process.env.EODHD_PRIVATE_USE, licence: process.env.VENDOR_DISPLAY_LICENSE, auth: process.env.AUTH };
afterEach(() => {
  for (const [name, value] of [["EODHD_PRIVATE_USE", saved.privateUse], ["VENDOR_DISPLAY_LICENSE", saved.licence], ["AUTH", saved.auth]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

it("keeps customer responses private and the public shell shareable", async () => {
  process.env.AUTH = "on";
  const cookie = `${CUSTOMER_SESSION_COOKIE}=forged`;
  for (const path of ["/en", "/en/account", "/api/auth/get-session"]) {
    const response = await proxy(new NextRequest(`https://example.test${path}`, { headers: { cookie } }));
    expect(response.headers.get("cache-control"), path).toBe("private, no-store");
    expect(response.headers.get("vary"), path).toContain("Cookie");
  }
  for (const path of ["/en", "/en/scanner", "/en/methodology"]) {
    const publicResponse = await proxy(new NextRequest(`https://example.test${path}`, { headers: { cookie: "theme=dark" } }));
    expect(publicResponse.headers.get("cache-control"), path).toBeNull();
  }
});

it("recognises every customer cookie name and nothing else", () => {
  expect(hasCustomerCookie("__Host-ib_session=a.b")).toBe(true);
  expect(hasCustomerCookie("theme=dark; __Host-ib_session_data=x")).toBe(true);
  expect(hasCustomerCookie("ib_session=a.b")).toBe(true);
  expect(hasCustomerCookie("__Host-owner_session=x; theme=dark")).toBe(false);
  expect(hasCustomerCookie("not_ib_session=x")).toBe(false);
  expect(hasCustomerCookie(null)).toBe(false);
});

it("does not grant owner or vendor access from a customer cookie", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.VENDOR_DISPLAY_LICENSE = "off";
  const response = await proxy(new NextRequest("https://example.test/en/stocks", { headers: { cookie: `${CUSTOMER_SESSION_COOKIE}=forged` } }));
  expect(response.status).toBe(401);
  expect(canUseVendorData({ tier: "admin", preview: false, owner: false })).toBe(false);
  expect(canUseVendorData({ tier: "free", preview: false, owner: true })).toBe(true);
  const upgrade = requireFeature({ tier: "free", preview: false, userId: "1" }, "csv-export");
  expect(upgrade?.status).toBe(403);
  expect(upgrade?.headers.get("cache-control")).toBe("private, no-store");
  expect(requireFeature({ tier: "free", preview: false }, "csv-export")?.status).toBe(401);
  expect(requireFeature({ tier: "paid", preview: false, userId: "1" }, "csv-export")).toBeNull();
});
