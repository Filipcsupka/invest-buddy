import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const universe = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe() }));
import { proxy } from "./proxy";

const original = { mode: process.env.DATA_MODE, ideas: process.env.IDEAS_PAGE, owner: process.env.OWNER_VIEW, password: process.env.OWNER_RESEARCH_PASSWORD, paywall: process.env.PAYWALL, auth: process.env.AUTH, advice: process.env.ADVICE_OUTPUT };
afterEach(() => {
  universe.mockReset();
  for (const [key, value] of [["DATA_MODE", original.mode], ["IDEAS_PAGE", original.ideas], ["OWNER_VIEW", original.owner], ["OWNER_RESEARCH_PASSWORD", original.password], ["PAYWALL", original.paywall], ["AUTH", original.auth], ["ADVICE_OUTPUT", original.advice]] as const) {
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
  for (const path of ["ideas", "owner-allocation", "sizing", "company/ZZZZ"]) {
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

it.each(["en", "sk"])("opens the %s scanner whatever PAYWALL says", async (locale) => {
  for (const paywall of ["on", "off", undefined]) {
    if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
    const response = await proxy(new NextRequest(`https://example.com/${locale}/scanner?min=12`));
    expect(response.status, String(paywall)).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  }
});

it("marks ?view= previews noindex and drops a client-sent preview header", async () => {
  delete process.env.AUTH;
  const plain = await proxy(new NextRequest("https://example.com/en/scanner"));
  expect(plain.headers.get("x-robots-tag")).toBeNull();
  const preview = await proxy(new NextRequest("https://example.com/en/scanner?view=free"));
  expect(preview.status).toBe(200);
  expect(preview.headers.get("x-robots-tag")).toBe("noindex");
  expect(preview.headers.get("x-middleware-request-x-tier-preview")).toBe("free");
  const spoof = await proxy(new NextRequest("https://example.com/en/scanner", { headers: { "x-tier-preview": "free" } }));
  expect(spoof.headers.get("x-middleware-request-x-tier-preview")).toBeNull();
});

it("does not forward the preview for a non-admin viewer", async () => {
  process.env.AUTH = "on";
  try {
    const response = await proxy(new NextRequest("https://example.com/en/scanner?view=free"));
    expect(response.headers.get("x-middleware-request-x-tier-preview")).toBeNull();
  } finally { delete process.env.AUTH; }
});

it.each(["en", "sk"])("keeps legal and owner gates shut for an admin viewer on %s, preview or not", async (locale) => {
  delete process.env.AUTH; delete process.env.IDEAS_PAGE; delete process.env.OWNER_VIEW; delete process.env.ADVICE_OUTPUT; delete process.env.DATA_MODE;
  for (const query of ["", "?view=free"]) {
    for (const path of ["sizing", "ideas", "owner-allocation", "owner/research/SMPL"]) {
      const response = await proxy(new NextRequest(`https://example.com/${locale}/${path}${query}`));
      expect(response.status, `${path}${query}`).toBe(404);
    }
  }
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

it("shows the SK title and the request id on the /sk/sizing 404, and keeps a valid incoming id", async () => {
  delete process.env.ADVICE_OUTPUT;
  const response = await proxy(new NextRequest("https://example.com/sk/sizing", { headers: { "x-request-id": "abc-12345678" } }));
  expect(response.status).toBe(404);
  const body = await response.text();
  expect(body).toContain("Stránka sa nenašla");
  expect(body).toContain("abc-12345678");
  expect(response.headers.get("x-request-id")).toBe("abc-12345678");
});

it.each(["en", "sk"])("hides the %s design kit page in a production build unless DESIGN_VIEW or fixture data is on", async (locale) => {
  const url = `https://example.com/${locale}/design`;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATA_MODE", "db");
  vi.stubEnv("DESIGN_VIEW", "");
  try {
    expect((await proxy(new NextRequest(url))).status).toBe(404);
    vi.stubEnv("DESIGN_VIEW", "on");
    expect((await proxy(new NextRequest(url))).status).toBe(200);
    vi.stubEnv("DESIGN_VIEW", "off");
    vi.stubEnv("DATA_MODE", "fixture");
    expect((await proxy(new NextRequest(url))).status).toBe(200);
  } finally {
    vi.unstubAllEnvs();
  }
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

it.each(["/en", "/sk/methodology", "/en/company/ZZZZ", "/api/health", "/unknown-path"])("sets the CSP per request from ANALYTICS_* at run time on %s", async (path) => {
  universe.mockResolvedValue([]);
  const keys = ["ANALYTICS", "ANALYTICS_URL", "ANALYTICS_DOMAIN"] as const;
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    const off = await proxy(new NextRequest(`https://example.com${path}`));
    expect(off.headers.get("content-security-policy")).toContain("connect-src 'self';");
    expect(off.headers.get("content-security-policy")).not.toContain("stats.example.org");
    // Same module instance, env changed after import: the next request picks it up.
    process.env.ANALYTICS = "on";
    process.env.ANALYTICS_URL = "https://stats.example.org/js/script.js";
    process.env.ANALYTICS_DOMAIN = "invest.example.org";
    const on = await proxy(new NextRequest(`https://example.com${path}`));
    expect(on.headers.get("content-security-policy")).toContain("script-src 'self' 'unsafe-inline'");
    expect(on.headers.get("content-security-policy")).toContain("connect-src 'self' https://stats.example.org;");
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});
