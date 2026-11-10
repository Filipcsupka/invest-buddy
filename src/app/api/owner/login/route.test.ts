import { afterEach, beforeEach, expect, it, vi } from "vitest";
let POST: typeof import("./route").POST;
beforeEach(async () => {
  vi.resetModules();
  POST = (await import("./route")).POST;
});
import { POST as logout } from "../logout/route";
import { OWNER_SESSION_COOKIE } from "@/security/owner-session";

const oldPassword = process.env.OWNER_RESEARCH_PASSWORD;
const oldSecret = process.env.OWNER_SESSION_SECRET;
const request = (password: string, locale = "en") => new Request("https://example.test/api/owner/login", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": crypto.randomUUID() },
  body: new URLSearchParams({ password, locale }),
});
afterEach(() => {
  if (oldPassword === undefined) delete process.env.OWNER_RESEARCH_PASSWORD; else process.env.OWNER_RESEARCH_PASSWORD = oldPassword;
  if (oldSecret === undefined) delete process.env.OWNER_SESSION_SECRET; else process.env.OWNER_SESSION_SECRET = oldSecret;
});

it("issues a secure site-wide cookie after a correct password", async () => {
  process.env.OWNER_RESEARCH_PASSWORD = "correct";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const response = await POST(request("correct", "sk"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/sk/dashboard");
  expect(response.headers.get("set-cookie")).toContain(`${OWNER_SESSION_COOKIE}=`);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(response.headers.get("set-cookie")).toContain("Path=/");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
});

it("does not reveal or issue a cookie for a wrong password or missing secret", async () => {
  process.env.OWNER_RESEARCH_PASSWORD = "correct";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const wrong = await POST(request("wrong"));
  expect(wrong.status).toBe(303);
  expect(wrong.headers.get("set-cookie")).toBeNull();
  expect(wrong.headers.get("location")).toBe("/en/owner-sign-in?error=1");
  delete process.env.OWNER_SESSION_SECRET;
  const missing = await POST(request("correct"));
  expect(missing.headers.get("set-cookie")).toBeNull();
  expect(JSON.stringify([...missing.headers])).not.toContain("correct");
});

it("clears the root-path cookie on logout", async () => {
  const response = await logout(new Request("https://example.test/api/owner/logout", { method: "POST", body: new URLSearchParams({ locale: "sk" }) }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/sk/owner-sign-in");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(response.headers.get("set-cookie")).toContain("Path=/");
});

it("limits repeated guesses from one client and rejects cross-site form posts", async () => {
  process.env.OWNER_RESEARCH_PASSWORD = "correct";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const make = () => new Request("https://example.test/api/owner/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": "192.0.2.77" },
    body: new URLSearchParams({ password: "wrong", locale: "en" }),
  });
  for (let i = 0; i < 5; i++) expect((await POST(make())).status).toBe(303);
  expect((await POST(make())).status).toBe(429);
  const crossSite = await POST(new Request("https://example.test/api/owner/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "cross-site" },
    body: new URLSearchParams({ password: "correct" }),
  }));
  expect(crossSite.status).toBe(403);
});

const configure = () => {
  process.env.OWNER_RESEARCH_PASSWORD = "correct";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
};
const bindRequest = (password: string, headers: Record<string, string> = {}) => new Request("http://0.0.0.0:3000/api/owner/login", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  body: new URLSearchParams({ password, locale: "sk" }),
});

it("keeps successful, failed and logout redirects relative behind a proxy", async () => {
  configure();
  expect((await POST(bindRequest("correct"))).headers.get("location")).toBe("/sk/dashboard");
  expect((await POST(bindRequest("wrong"))).headers.get("location")).toBe("/sk/owner-sign-in?error=1");
  expect((await logout(bindRequest(""))).headers.get("location")).toBe("/sk/owner-sign-in");
});

it("does not spend the global failure budget on successful logins", async () => {
  configure();
  for (let i = 0; i < 35; i++) {
    expect((await POST(bindRequest("correct", { "x-real-ip": `192.0.2.${i}` }))).status).toBe(303);
  }
  expect((await POST(bindRequest("wrong"))).status).toBe(303);
});

it("limits distributed failures but permits valid credentials after exhaustion", async () => {
  configure();
  for (let i = 0; i < 30; i++) {
    expect((await POST(bindRequest("wrong", { "x-real-ip": `192.0.2.${i}` }))).status).toBe(303);
  }
  const blocked = await POST(bindRequest("wrong", { "x-real-ip": "192.0.2.99" }));
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await POST(bindRequest("correct"))).headers.get("set-cookie")).toContain(OWNER_SESSION_COOKIE);
});

it("does not let the shared unknown IP bucket lock out valid sign-ins", async () => {
  configure();
  for (let i = 0; i < 30; i++) expect((await POST(bindRequest("wrong"))).status).toBe(303);
  expect((await POST(bindRequest("wrong"))).status).toBe(429);
  for (let i = 0; i < 10; i++) expect((await POST(bindRequest("correct"))).status).toBe(303);
});

it.each([
  [{ origin: "https://evil.test", host: "example.test" }, false],
  [{ origin: "null", host: "example.test" }, false],
  [{ origin: "invalid", host: "example.test" }, false],
  [{ origin: "https://example.test" }, false],
  [{ origin: "https://example.test:8443", host: "example.test" }, false],
  [{ origin: "https://example.test", host: "example.test" }, true],
  [{ origin: "https://example.test", host: "0.0.0.0:3000", "x-forwarded-host": "example.test" }, true],
  [{ origin: "https://evil.test", host: "evil.test", "x-forwarded-host": "example.test" }, false],
  [{ "sec-fetch-site": "same-site" }, false],
  [{ "sec-fetch-site": "cross-site" }, false],
  [{ "sec-fetch-site": "unexpected" }, false],
  [{ "sec-fetch-site": "same-origin" }, true],
  [{ "sec-fetch-site": "none" }, true],
  [{ origin: "https://evil.test", host: "example.test", "sec-fetch-site": "same-origin" }, false],
] as [Record<string, string>, boolean][])("checks browser CSRF metadata %j on login and logout", async (headers, allowed) => {
  configure();
  for (const handler of [POST, logout]) {
    const response = await handler(bindRequest("correct", headers));
    expect(response.status).toBe(allowed ? 303 : 403);
    if (!allowed) expect(response.headers.get("set-cookie")).toBeNull();
  }
});

it("keeps per-IP limits on all attempts when a client address is available", async () => {
  configure();
  const headers = { "x-real-ip": "192.0.2.123" };
  for (let i = 0; i < 5; i++) expect((await POST(bindRequest("correct", headers))).status).toBe(303);
  expect((await POST(bindRequest("correct", headers))).status).toBe(429);
  expect((await POST(bindRequest("correct", { "x-real-ip": "192.0.2.124" }))).status).toBe(303);
});
