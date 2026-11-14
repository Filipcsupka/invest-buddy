import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const universe = vi.fn();
vi.mock("@/data/store", () => ({ instrumentForTicker: async (ticker: string) => (await universe()).find((item: { ticker: string }) => item.ticker === ticker.toUpperCase()) ?? null }));
vi.mock("@/viewer/get-viewer", () => ({
  viewerFromHeaders: async (headers: Headers) => {
    const cookie = headers.get("cookie") ?? "";
    if (cookie.includes("ib_session=owner")) return { tier: "admin", preview: false, owner: true, userId: "1" };
    if (cookie.includes("ib_session=plus")) return { tier: "paid", preview: false, owner: false, userId: "3", plan: "plus" };
    if (cookie.includes("ib_session=trial")) return { tier: "paid", preview: false, owner: false, userId: "4", plan: "trial" };
    if (cookie.includes("ib_session=passive")) return { tier: "free", preview: false, owner: false, userId: "5", plan: "passive" };
    if (cookie.includes("ib_session=free")) return { tier: "free", preview: false, owner: false, userId: "6", plan: "free" };
    if (cookie.includes("ib_session=customer")) return { tier: "paid", preview: false, owner: false, userId: "2" };
    return { tier: "free", preview: false };
  },
}));
import { proxy } from "./proxy";

const ownerCookie = { cookie: "__Host-ib_session=owner" };
const customerCookie = { cookie: "__Host-ib_session=customer" };
const browserDoc = { "sec-fetch-dest": "document", accept: "text/html" };

const original = { mode: process.env.DATA_MODE, ideas: process.env.IDEAS_PAGE, owner: process.env.OWNER_VIEW, paywall: process.env.PAYWALL, auth: process.env.AUTH, advice: process.env.ADVICE_OUTPUT, markets: process.env.MARKETS_VIEWS, privateUse: process.env.EODHD_PRIVATE_USE, insiders: process.env.INSIDERS_PAGE, licence: process.env.VENDOR_DISPLAY_LICENSE };
afterEach(() => {
  universe.mockReset();
  for (const [key, value] of [["DATA_MODE", original.mode], ["IDEAS_PAGE", original.ideas], ["OWNER_VIEW", original.owner], ["PAYWALL", original.paywall], ["AUTH", original.auth], ["ADVICE_OUTPUT", original.advice], ["MARKETS_VIEWS", original.markets], ["EODHD_PRIVATE_USE", original.privateUse], ["INSIDERS_PAGE", original.insiders], ["VENDOR_DISPLAY_LICENSE", original.licence]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it("keeps vendor-backed pages private while allowing public content and health probes", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.AUTH = "on";
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  for (const path of ["stocks", "company/NVDA", "etf", "heatmap", "insiders", "portfolio", "track-record"]) {
    const url = `https://example.com/en/${path}`;
    const blocked = await proxy(new NextRequest(url));
    expect(blocked.status, path).toBe(401);
    expect(blocked.headers.get("cache-control"), path).toBe("private, no-store");
    const owner = await proxy(new NextRequest(url, { headers: ownerCookie }));
    expect(owner.status, path).toBe(200);
    expect(owner.headers.get("x-robots-tag"), path).toBe("noindex");
  }
  for (const path of ["/en", "/en/methodology", "/en/legal/terms", "/api/health", "/_next/static/test.js", "/favicon.svg"]) {
    expect((await proxy(new NextRequest(`https://example.com${path}`))).status, path).toBe(200);
  }
});

it("opens vendor-backed pages to Plus and trial customers, not to free customers or owner-allocation", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.AUTH = "on";
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  for (const path of ["stocks", "company/NVDA", "heatmap", "insiders", "portfolio", "track-record"]) {
    const url = `https://example.com/en/${path}`;
    for (const who of ["plus", "trial"]) {
      const response = await proxy(new NextRequest(url, { headers: { cookie: `__Host-ib_session=${who}` } }));
      expect(response.status, `${who} ${path}`).toBe(200);
      expect(response.headers.get("cache-control"), path).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex");
    }
    expect((await proxy(new NextRequest(url, { headers: customerCookie }))).status, `free ${path}`).toBe(401);
  }
  process.env.OWNER_VIEW = "on";
  const plusAllocation = await proxy(new NextRequest("https://example.com/en/owner-allocation", { headers: { cookie: "__Host-ib_session=plus" } }));
  expect(plusAllocation.status).toBe(401);
});

/** Per-route gate for each tier while EODHD_PRIVATE_USE and MARKETS_VIEWS are on. 200 opens, 401 refuses (plain client request). */
const ROUTE_MATRIX: [string, Record<"anon" | "free" | "passive" | "plus" | "trial" | "owner", number>][] = [
  ["dashboard", { anon: 200, free: 200, passive: 200, plus: 200, trial: 200, owner: 200 }],
  ["stocks", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["company/NVDA", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["heatmap", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["track-record", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["portfolio", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["insiders", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["screener", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["news", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["congress", { anon: 401, free: 401, passive: 401, plus: 200, trial: 200, owner: 200 }],
  ["etf", { anon: 401, free: 401, passive: 200, plus: 200, trial: 200, owner: 200 }],
  ["etf/fund/NYSEARCA%3ASPY/holdings", { anon: 401, free: 401, passive: 200, plus: 200, trial: 200, owner: 200 }],
  ["indices", { anon: 401, free: 401, passive: 200, plus: 200, trial: 200, owner: 200 }],
  ["economy", { anon: 401, free: 401, passive: 200, plus: 200, trial: 200, owner: 200 }],
  ["calendar", { anon: 401, free: 401, passive: 200, plus: 200, trial: 200, owner: 200 }],
];

it.each(ROUTE_MATRIX)("gates /%s per tier: free and Passive never reach stock routes", async (path, expected) => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.AUTH = "on";
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  // Many requests from one client key: keep the page limiter out of the result and out of later tests.
  const { resetRateLimits } = await import("@/security/rate-limit");
  resetRateLimits();
  for (const [who, status] of Object.entries(expected)) {
    const headers = who === "anon" ? undefined : { cookie: `__Host-ib_session=${who}` };
    const response = await proxy(new NextRequest(`https://example.com/en/${path}`, { headers }));
    expect(response.status, `${who} /${path}`).toBe(status);
    expect(response.headers.get("cache-control"), `${who} /${path}`).toBe("private, no-store");
  }
  resetRateLimits();
});

it("sends a signed-in Passive browser from a stock page to the Plus preview, and an anonymous one to sign-in", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.AUTH = "on";
  const passive = await proxy(new NextRequest("https://example.com/en/stocks", { headers: { ...browserDoc, cookie: "__Host-ib_session=passive" } }));
  expect(passive.status).toBe(307);
  expect(passive.headers.get("location")).toBe("https://example.com/en/opens-soon?page=stocks");
  const anon = await proxy(new NextRequest("https://example.com/en/stocks", { headers: browserDoc }));
  expect(anon.headers.get("location")).toContain("/en/sign-in?mode=sign-in&next=");
});

it.each(["on", "off"] as const)("private use %s: stock routes need Active or owner access with and without a display licence, for documents and RSC", async (privateUse) => {
  process.env.EODHD_PRIVATE_USE = privateUse;
  process.env.AUTH = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.INSIDERS_PAGE = "on";
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  const { resetRateLimits } = await import("@/security/rate-limit");
  const routes = ["stocks", "company/NVDA", "heatmap", "portfolio", "track-record", "insiders", "news", "congress", "screener"];
  for (const licence of ["on", "off"] as const) {
    process.env.VENDOR_DISPLAY_LICENSE = licence;
    for (const path of routes) {
      resetRateLimits();
      for (const who of [undefined, "free", "passive"]) {
        const cookie = who ? { cookie: `__Host-ib_session=${who}` } : undefined;
        const expected = who ? "/en/opens-soon" : "/en/sign-in";
        const documentResponse = await proxy(new NextRequest(`https://example.com/en/${path}`, { headers: new Headers({ ...browserDoc, ...cookie }) }));
        expect(documentResponse.status, `${privateUse} ${licence} ${who ?? "anon"} ${path} document`).toBe(307);
        expect(documentResponse.headers.get("location"), path).toContain(expected);
        const rscResponse = await proxy(new NextRequest(`https://example.com/en/${path}`, { headers: new Headers({ rsc: "1", ...cookie }) }));
        expect(rscResponse.status, `${privateUse} ${licence} ${who ?? "anon"} ${path} RSC`).toBe(401);
      }
      for (const who of ["plus", "trial", "owner"]) {
        const headers = { ...browserDoc, cookie: `__Host-ib_session=${who}` };
        expect((await proxy(new NextRequest(`https://example.com/en/${path}`, { headers }))).status, `${who} ${path}`).toBe(200);
      }
    }
    expect((await proxy(new NextRequest("https://example.com/en/dashboard"))).status).toBe(200);
  }
  resetRateLimits();
});

it("keeps market routes private even when the flag is on", async () => {
  const url = "https://example.com/en/indices";
  process.env.MARKETS_VIEWS = "off";
  expect((await proxy(new NextRequest(url))).status).toBe(404);
  process.env.MARKETS_VIEWS = "on";
  process.env.AUTH = "on";
  expect((await proxy(new NextRequest(url))).status).toBe(401);
  const response = await proxy(new NextRequest(url, { headers: ownerCookie }));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it.each(["en", "sk"])('returns a permanent HTTP redirect from /scanner with filters (%s)', async (locale) => {
  process.env.EODHD_PRIVATE_USE = "on";
  const response = await proxy(new NextRequest(`https://example.com/${locale}/scanner?state=watch&q=NVDA`));
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe(`https://example.com/${locale}/stocks?state=watch&q=NVDA`);
});

it("keeps insiders available when its flag is on and markets are off", async () => {
  process.env.AUTH = "on";
  process.env.INSIDERS_PAGE = "on";
  process.env.MARKETS_VIEWS = "off";
  process.env.EODHD_PRIVATE_USE = "off";
  expect((await proxy(new NextRequest("https://example.com/en/insiders"))).status).toBe(401);
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  expect((await proxy(new NextRequest("https://example.com/en/insiders"))).status).toBe(401);
  delete process.env.VENDOR_DISPLAY_LICENSE;
  process.env.EODHD_PRIVATE_USE = "on";
  expect((await proxy(new NextRequest("https://example.com/en/insiders"))).status).toBe(401);
  expect((await proxy(new NextRequest("https://example.com/en/insiders", { headers: { cookie: "__Host-ib_session=plus" } }))).status).toBe(200);
  process.env.INSIDERS_PAGE = "off";
  expect((await proxy(new NextRequest("https://example.com/en/insiders", { headers: ownerCookie }))).status).toBe(404);
});

it("gates the owner ETF data tabs like market routes and leaves the public fund page open", async () => {
  const tab = "https://example.com/en/etf/fund/NYSEARCA%3ASPY/holdings";
  process.env.MARKETS_VIEWS = "off";
  expect((await proxy(new NextRequest(tab))).status).toBe(404);
  // The fund page is a paid ETF page: Passive and Active, never a visitor or a free account, licence or not.
  process.env.AUTH = "on";
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  expect((await proxy(new NextRequest("https://example.com/en/etf/fund/NYSEARCA%3ASPY"))).status).toBe(401);
  expect((await proxy(new NextRequest("https://example.com/en/etf/fund/NYSEARCA%3ASPY", { headers: { cookie: "__Host-ib_session=free" } }))).status).toBe(401);
  expect((await proxy(new NextRequest("https://example.com/en/etf/fund/NYSEARCA%3ASPY", { headers: { cookie: "__Host-ib_session=passive" } }))).status).toBe(200);
  delete process.env.VENDOR_DISPLAY_LICENSE;
  // Private use off with a display licence: a free account still cannot open a fund data tab.
  process.env.MARKETS_VIEWS = "on";
  process.env.EODHD_PRIVATE_USE = "off";
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  expect((await proxy(new NextRequest(tab, { headers: { cookie: "__Host-ib_session=free" } }))).status).toBe(401);
  expect((await proxy(new NextRequest(tab, { headers: { cookie: "__Host-ib_session=passive" } }))).status).toBe(200);
  expect((await proxy(new NextRequest("https://example.com/en/indices", { headers: { cookie: "__Host-ib_session=free" } }))).status).toBe(200);
  delete process.env.VENDOR_DISPLAY_LICENSE;
  process.env.MARKETS_VIEWS = "off";
  process.env.MARKETS_VIEWS = "on";
  process.env.AUTH = "on";
  expect((await proxy(new NextRequest(tab))).status).toBe(401);
  const response = await proxy(new NextRequest(tab, { headers: ownerCookie }));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("owner pages need an owner session: anonymous browsers go to sign-in, signed-in customers get 404, clients get a plain 401", async () => {
  process.env.OWNER_VIEW = "on";
  process.env.AUTH = "on";
  const url = "https://example.com/en/owner/horizons";
  const client = await proxy(new NextRequest(url));
  expect(client.status).toBe(401);
  expect(client.headers.get("www-authenticate")).toBeNull();
  expect((await proxy(new NextRequest(url, { headers: { authorization: `Basic ${Buffer.from("owner:anything").toString("base64")}` } }))).status).toBe(401);
  const browser = await proxy(new NextRequest(url, { headers: browserDoc }));
  expect(browser.status).toBe(303);
  expect(browser.headers.get("location")).toBe("https://example.com/en/sign-in?mode=sign-in&next=%2Fen%2Fowner%2Fhorizons");
  expect((await proxy(new NextRequest(url, { headers: { ...browserDoc, ...customerCookie } }))).status).toBe(404);
  expect((await proxy(new NextRequest(url, { headers: ownerCookie }))).status).toBe(200);
  process.env.OWNER_VIEW = "off";
  expect((await proxy(new NextRequest(url))).status).toBe(404);
});

it("owner session never works while AUTH is off", async () => {
  process.env.OWNER_VIEW = "on";
  delete process.env.AUTH;
  expect((await proxy(new NextRequest("https://example.com/en/owner/horizons", { headers: ownerCookie }))).status).toBe(401);
});

it.each(["en", "sk"])("returns a real 404 for unavailable %s routes", async (locale) => {
  delete process.env.DATA_MODE; delete process.env.IDEAS_PAGE; delete process.env.OWNER_VIEW; delete process.env.PAYWALL; delete process.env.ADVICE_OUTPUT;
  process.env.AUTH = "on";
  // An unknown company remains a 404 even when stock access is otherwise locked.
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  for (const path of ["ideas", "owner-allocation", "sizing", "company/ZZZZ"]) {
    const response = await proxy(new NextRequest(`https://example.com/${locale}/${path}`, { headers: path === "company/ZZZZ" ? ownerCookie : undefined }));
    expect(response.status, path).toBe(404);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.text()).toContain("<h1>");
  }
  const known = await proxy(new NextRequest(`https://example.com/${locale}/company/NVDA`, { headers: ownerCookie }));
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
  process.env.AUTH = "on";
  process.env.ADVICE_OUTPUT = "off";
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  expect((await proxy(new NextRequest(`https://example.com/${locale}/ideas`))).status).toBe(404);
  process.env.ADVICE_OUTPUT = "on";
  expect((await proxy(new NextRequest(`https://example.com/${locale}/ideas`, { headers: ownerCookie }))).status).toBe(200);
});

it.each(["en", "sk"])("redirects the %s scanner whatever PAYWALL says", async (locale) => {
  for (const paywall of ["on", "off", undefined]) {
    if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
    const response = await proxy(new NextRequest(`https://example.com/${locale}/scanner?min=12`));
    expect(response.status, String(paywall)).toBe(308);
    expect(response.headers.get("location")).toBe(`https://example.com/${locale}/stocks?min=12`);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  }
});

it("marks ?view= previews noindex and drops a client-sent preview header", async () => {
  process.env.AUTH = "on";
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  const plain = await proxy(new NextRequest("https://example.com/en/stocks"));
  expect(plain.status).toBe(401);
  expect(plain.headers.get("x-robots-tag")).toBe("noindex");
  // AUTH off no longer makes every visitor admin: only the owner gets the free preview.
  const anonymous = await proxy(new NextRequest("https://example.com/en/stocks?view=free"));
  expect(anonymous.headers.get("x-robots-tag")).toBe("noindex");
  expect(anonymous.headers.get("x-middleware-request-x-tier-preview")).toBeNull();
  const preview = await proxy(new NextRequest("https://example.com/en/stocks?view=free", { headers: ownerCookie }));
  expect(preview.status).toBe(200);
  expect(preview.headers.get("x-robots-tag")).toBe("noindex");
  expect(preview.headers.get("x-middleware-request-x-tier-preview")).toBe("free");
  const spoof = await proxy(new NextRequest("https://example.com/en/stocks", { headers: { "x-tier-preview": "free" } }));
  expect(spoof.headers.get("x-middleware-request-x-tier-preview")).toBeNull();
});

it("does not forward the preview for a non-admin viewer", async () => {
  process.env.AUTH = "on";
  try {
    const response = await proxy(new NextRequest("https://example.com/en/stocks?view=free"));
    expect(response.headers.get("x-middleware-request-x-tier-preview")).toBeNull();
  } finally { delete process.env.AUTH; }
});

it.each(["en", "sk"])("keeps legal and owner gates shut for an admin viewer on %s, preview or not", async (locale) => {
  delete process.env.AUTH; delete process.env.IDEAS_PAGE; delete process.env.OWNER_VIEW; delete process.env.ADVICE_OUTPUT; delete process.env.DATA_MODE;
  for (const query of ["", "?view=free"]) {
    for (const path of ["sizing", "ideas", "owner-allocation", "owner/horizons"]) {
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

it("limits invalid ingest credentials at the proxy but exempts the valid token", async () => {
  const previousToken = process.env.INGEST_TOKEN;
  const previousLimit = process.env.RATE_LIMIT_API_PER_MIN;
  const { resetRateLimits } = await import("@/security/rate-limit");
  process.env.INGEST_TOKEN = "ingest-secret";
  process.env.RATE_LIMIT_API_PER_MIN = "2";
  resetRateLimits();
  try {
    const call = (authorization?: string) => proxy(new NextRequest("https://example.com/api/ingest/scan", {
      headers: { "x-forwarded-for": "10.0.0.2", ...(authorization ? { authorization } : {}) },
    }));
    expect((await call("Bearer invalid")).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call("Bearer invalid")).status).toBe(429);
    expect((await call("Bearer ingest-secret")).status).toBe(200);
    expect((await call("Bearer ingest-secret")).status).toBe(200);
  } finally {
    if (previousToken === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = previousToken;
    if (previousLimit === undefined) delete process.env.RATE_LIMIT_API_PER_MIN; else process.env.RATE_LIMIT_API_PER_MIN = previousLimit;
    resetRateLimits();
  }
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
  process.env.AUTH = "on";
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  const response = await proxy(new NextRequest("https://example.com/en/stocks", { headers: { ...ownerCookie, "x-request-id": "bad id<script>" } }));
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

it.each(["en", "sk"])("gates each paid section for five viewer states (%s)", async (locale) => {
  process.env.AUTH = "on";
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.INSIDERS_PAGE = "on";
  for (const route of ["etf", "etf/track-record", "indices", "indices/GSPC", "economy", "calendar", "news", "congress", "insiders", "screener"]) {
    const url = `https://example.com/${locale}/${route}`;
    expect((await proxy(new NextRequest(url))).status, `anon ${route}`).toBe(401);
    expect((await proxy(new NextRequest(url, { headers: customerCookie }))).status, `free ${route}`).toBe(401);
    for (const who of ["owner", "plus", "trial"]) {
      expect((await proxy(new NextRequest(url, { headers: { cookie: `__Host-ib_session=${who}` } }))).status, `${who} ${route}`).toBe(200);
    }
  }
});

it.each(["forex", "forex/EURUSD", "crypto", "crypto/BTC-USD"])("returns 404 for removed %s routes", async (route) => {
  process.env.AUTH = "on";
  process.env.MARKETS_VIEWS = "on";
  expect((await proxy(new NextRequest(`https://example.com/en/${route}`, { headers: ownerCookie }))).status).toBe(404);
});
