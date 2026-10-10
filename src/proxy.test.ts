import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const universe = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe() }));
import { proxy } from "./proxy";

const original = { mode: process.env.DATA_MODE, ideas: process.env.IDEAS_PAGE, owner: process.env.OWNER_VIEW, paywall: process.env.PAYWALL, advice: process.env.ADVICE_OUTPUT };
afterEach(() => {
  universe.mockReset();
  for (const [key, value] of [["DATA_MODE", original.mode], ["IDEAS_PAGE", original.ideas], ["OWNER_VIEW", original.owner], ["PAYWALL", original.paywall], ["ADVICE_OUTPUT", original.advice]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it.each(["en", "sk"])("returns a real 404 for unavailable %s routes", async (locale) => {
  delete process.env.DATA_MODE; delete process.env.IDEAS_PAGE; delete process.env.OWNER_VIEW; delete process.env.PAYWALL; delete process.env.ADVICE_OUTPUT;
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  for (const path of ["ideas", "owner-allocation", "scanner", "sizing", "company/ZZZZ"]) {
    const response = await proxy(new NextRequest(`https://example.com/${locale}/${path}`));
    expect(response.status, path).toBe(404);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.text()).toContain("<h1>");
  }
  const known = await proxy(new NextRequest(`https://example.com/${locale}/company/NVDA`));
  expect(known.status).toBe(200);
  expect(known.headers.get("x-request-id")).toBeTruthy();
});

it.each(["en", "sk"])("opens the %s sizing guide only with ADVICE_OUTPUT on", async (locale) => {
  process.env.ADVICE_OUTPUT = "on";
  const response = await proxy(new NextRequest(`https://example.com/${locale}/sizing`));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBeTruthy();
});

it.each(["en", "sk"])("keeps %s ideas unavailable while advice is off", async (locale) => {
  process.env.IDEAS_PAGE = "on";
  process.env.ADVICE_OUTPUT = "off";
  expect((await proxy(new NextRequest(`https://example.com/${locale}/ideas`))).status).toBe(404);
  process.env.ADVICE_OUTPUT = "on";
  expect((await proxy(new NextRequest(`https://example.com/${locale}/ideas`))).status).toBe(200);
});

it.each(["en", "sk"])("opens the %s scanner only with PAYWALL on", async (locale) => {
  process.env.PAYWALL = "on";
  const response = await proxy(new NextRequest(`https://example.com/${locale}/scanner?min=12`));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBeTruthy();
});
