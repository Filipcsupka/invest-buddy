import { afterEach, expect, it } from "vitest";
import { POST } from "./route";
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
  expect(response.headers.get("location")).toBe("https://example.test/sk");
  expect(response.headers.get("set-cookie")).toContain(`${OWNER_SESSION_COOKIE}=`);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
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
  expect(wrong.headers.get("location")).toBe("https://example.test/en/owner-sign-in?error=1");
  delete process.env.OWNER_SESSION_SECRET;
  const missing = await POST(request("correct"));
  expect(missing.headers.get("set-cookie")).toBeNull();
  expect(JSON.stringify([...missing.headers])).not.toContain("correct");
});

it("clears the root-path cookie on logout", async () => {
  const response = await logout(new Request("https://example.test/api/owner/logout", { method: "POST", body: new URLSearchParams({ locale: "sk" }) }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://example.test/sk/owner-sign-in");
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
