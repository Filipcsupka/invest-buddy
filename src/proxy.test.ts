import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const universe = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe() }));
import { proxy } from "./proxy";

const original = { mode: process.env.DATA_MODE, ideas: process.env.IDEAS_PAGE, owner: process.env.OWNER_VIEW, password: process.env.OWNER_RESEARCH_PASSWORD, paywall: process.env.PAYWALL, advice: process.env.ADVICE_OUTPUT };
afterEach(() => {
  universe.mockReset();
  for (const [key, value] of [["DATA_MODE", original.mode], ["IDEAS_PAGE", original.ideas], ["OWNER_VIEW", original.owner], ["OWNER_RESEARCH_PASSWORD", original.password], ["PAYWALL", original.paywall], ["ADVICE_OUTPUT", original.advice]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it("challenges for private research and accepts only the owner password", async () => {
  process.env.OWNER_VIEW = "on";
  process.env.OWNER_RESEARCH_PASSWORD = "private-test-password";
  const url = "https://example.com/en/owner/research/SMPL";
  const missing = await proxy(new NextRequest(url));
  expect(missing.status).toBe(401);
  expect(missing.headers.get("www-authenticate")).toContain("Basic");
  expect((await proxy(new NextRequest(url, { headers: { authorization: `Basic ${Buffer.from("owner:wrong").toString("base64")}` } }))).status).toBe(401);
  expect((await proxy(new NextRequest(url, { headers: { authorization: `Basic ${Buffer.from("owner:private-test-password").toString("base64")}` } }))).status).toBe(200);
  process.env.OWNER_VIEW = "off";
  expect((await proxy(new NextRequest(url))).status).toBe(404);
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

it("passes api requests through and limits a caller over the cap", async () => {
  process.env.RATE_LIMIT_API_PER_MIN = "1";
  const { resetRateLimits } = await import("@/security/rate-limit");
  resetRateLimits();
  const call = () => proxy(new NextRequest("https://example.com/api/other", { headers: { "x-forwarded-for": "2.2.2.2" } }));
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(429);
  delete process.env.RATE_LIMIT_API_PER_MIN;
  resetRateLimits();
});

it("shows the SK title and the request id on the /sk/scanner 404, and keeps a valid incoming id", async () => {
  delete process.env.PAYWALL;
  const response = await proxy(new NextRequest("https://example.com/sk/scanner", { headers: { "x-request-id": "abc-12345678" } }));
  expect(response.status).toBe(404);
  const body = await response.text();
  expect(body).toContain("Stránka sa nenašla");
  expect(body).toContain("abc-12345678");
  expect(response.headers.get("x-request-id")).toBe("abc-12345678");
});

it("replaces a malformed incoming id", async () => {
  process.env.PAYWALL = "on";
  const response = await proxy(new NextRequest("https://example.com/en/scanner", { headers: { "x-request-id": "bad id<script>" } }));
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
});

it.each([["en", "Too many requests"], ["sk", "Príliš veľa"]])("renders the %s 429 page with request id and Retry-After", async (locale) => {
  process.env.RATE_LIMIT_PAGES_PER_MIN = "1";
  const { resetRateLimits } = await import("@/security/rate-limit");
  resetRateLimits();
  const call = () => proxy(new NextRequest(`https://example.com/${locale}/dashboard`, { headers: { "x-forwarded-for": "3.3.3.3", "x-request-id": "rl-12345678" } }));
  expect((await call()).status).toBe(200);
  const limited = await call();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("content-type")).toContain("text/html");
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(limited.headers.get("x-request-id")).toBe("rl-12345678");
  expect(await limited.text()).toContain("rl-12345678");
  delete process.env.RATE_LIMIT_PAGES_PER_MIN;
  resetRateLimits();
});
