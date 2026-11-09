import { afterEach, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { issueOwnerSession, OWNER_SESSION_COOKIE } from "./owner-session";

const saved = {
  password: process.env.OWNER_RESEARCH_PASSWORD,
  secret: process.env.OWNER_SESSION_SECRET,
  markets: process.env.MARKETS_VIEWS,
  privateUse: process.env.EODHD_PRIVATE_USE,
  owner: process.env.OWNER_VIEW,
};
afterEach(() => {
  for (const [key, name] of [["password", "OWNER_RESEARCH_PASSWORD"], ["secret", "OWNER_SESSION_SECRET"], ["markets", "MARKETS_VIEWS"], ["privateUse", "EODHD_PRIVATE_USE"], ["owner", "OWNER_VIEW"]] as const) {
    if (saved[key] === undefined) delete process.env[name]; else process.env[name] = saved[key];
  }
});

it.each(["en", "sk"])("authorizes the %s landing and Markets with a root cookie", async (locale) => {
  process.env.OWNER_RESEARCH_PASSWORD = "test-password";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  process.env.MARKETS_VIEWS = "on";
  process.env.EODHD_PRIVATE_USE = "on";
  const value = issueOwnerSession("test-password")!;
  const cookie = `${OWNER_SESSION_COOKIE}=${value}`;
  for (const path of ["", "/indices", "/dashboard"]) {
    const response = await proxy(new NextRequest(`https://example.test/${locale}${path}`, { headers: { cookie } }));
    expect(response.status, path).toBe(200);
    expect(response.headers.get("cache-control"), path).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag"), path).toBe("noindex");
    expect(response.headers.get("x-middleware-request-authorization"), path).toBe(`OwnerSession ${value}`);
  }
});

it("rejects a client-supplied session authorization header without the cookie", async () => {
  process.env.OWNER_RESEARCH_PASSWORD = "test-password";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  process.env.MARKETS_VIEWS = "on";
  const value = issueOwnerSession("test-password")!;
  const response = await proxy(new NextRequest("https://example.test/en/indices", { headers: { authorization: `OwnerSession ${value}` } }));
  expect(response.status).toBe(401);
  const publicResponse = await proxy(new NextRequest("https://example.test/en", { headers: { authorization: `OwnerSession ${value}` } }));
  expect(publicResponse.headers.get("x-middleware-request-authorization")).toBeNull();
});

it.each(["en", "sk"])("redirects %s HTML owner navigations and keeps the non-HTML challenge", async (locale) => {
  process.env.OWNER_VIEW = "on";
  for (const [accept, status] of [["text/html,application/xhtml+xml", 303], ["application/json", 401], ["*/*", 401]] as const) {
    const response = await proxy(new NextRequest(`http://0.0.0.0:3000/${locale}/owner`, { headers: { accept } }));
    expect(response.status).toBe(status);
    expect(response.headers.get("location")).toBe(status === 303 ? `/${locale}/owner-sign-in` : null);
    expect(response.headers.get("www-authenticate")).toBe(status === 401 ? 'Basic realm="Owner"' : null);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});
