import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RateLimitLockout } from "../http";
import { createHttp, SOURCE_HOSTS, retryAfterMs, type HttpDeps } from "./client";

function harness(responses: (url: string, init: RequestInit, n: number) => Response, deps: HttpDeps = {}) {
  let clock = 1_000_000;
  const waits: number[] = [];
  const requests: { url: string; init: RequestInit; at: number }[] = [];
  const http = createHttp({
    now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; }, secSlot: async () => {}, env: {},
    fetcher: async (url, init) => { requests.push({ url, init: init ?? {}, at: clock }); return responses(url, init ?? {}, requests.length); }, ...deps,
  });
  return { http, waits, requests };
}

describe("source http client", () => {
  it("spaces requests to one host by its minimum interval and does not delay other hosts", async () => {
    const { http, requests } = harness(() => new Response("{}"));
    await http.get("https://api.gdeltproject.org/a");
    await http.get("https://api.gdeltproject.org/b");
    await http.get("https://api.fda.gov/c");
    expect(requests[1].at - requests[0].at).toBeGreaterThanOrEqual(6000);
    expect(requests[2].at - requests[1].at).toBe(0);
  });

  it("waits for Retry-After on 429 and then succeeds", async () => {
    const { http, waits } = harness((_url, _init, n) => n === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "7" } }) : new Response("ok"));
    expect(await http.get("https://api.gdeltproject.org/x")).toBe("ok");
    expect(waits).toContain(7000);
  });

  it("backs off without Retry-After and stops with a lockout after four 429 answers", async () => {
    const { http, requests, waits } = harness(() => new Response("", { status: 429 }));
    await expect(http.get("https://api.gdeltproject.org/x")).rejects.toBeInstanceOf(RateLimitLockout);
    expect(requests).toHaveLength(4);
    expect(waits.filter((ms) => ms >= 15_000)).toHaveLength(3);
  });

  it("waits at least 15 s after a GDELT 429 and names a timeout clearly", async () => {
    const { http, waits } = harness((_url, _init, n) => n === 1 ? new Response("", { status: 429 }) : new Response("{}"));
    await http.get("https://api.gdeltproject.org/x");
    expect(waits).toContain(15_000);
    const slow = createHttp({ fetcher: async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); }, wait: async () => {}, secSlot: async () => {}, env: {} });
    await expect(slow.get("https://api.fda.gov/x?k=1", { timeoutMs: 8000 })).rejects.toThrow("Timed out after 8000 ms at https://api.fda.gov/x");
  });

  it("fails fast with one attempt (used by pings)", async () => {
    const { http, requests } = harness(() => new Response("", { status: 429 }));
    await expect(http.get("https://api.gdeltproject.org/x", { maxAttempts: 1 })).rejects.toBeInstanceOf(RateLimitLockout);
    expect(requests).toHaveLength(1);
  });

  it("retries 5xx and then reports the status without the query string", async () => {
    const { http, requests } = harness(() => new Response("", { status: 503 }));
    await expect(http.get("https://api.fda.gov/x?secret=1")).rejects.toThrow(/^HTTP 503 at https:\/\/api\.fda\.gov\/x$/);
    expect(requests).toHaveLength(4);
  });

  it("follows a redirect only to https hosts on the allow list", async () => {
    const redirects = (url: string) => url.startsWith("https://cdn.cboe.com") ? new Response("", { status: 307, headers: { location: "https://cdn-api.cboe.com/file.csv" } }) : new Response("DATE,CLOSE");
    const { http } = harness(redirects);
    expect(await http.get("https://cdn.cboe.com/file.csv", { redirectHosts: ["cdn-api.cboe.com"] })).toBe("DATE,CLOSE");
    await expect(http.get("https://cdn.cboe.com/file.csv")).rejects.toThrow("unexpected host cdn-api.cboe.com");
    const insecure = harness(() => new Response("", { status: 302, headers: { location: "http://cdn-api.cboe.com/file.csv" } })).http;
    await expect(insecure.get("https://cdn.cboe.com/file.csv", { redirectHosts: ["cdn-api.cboe.com"] })).rejects.toThrow("Insecure redirect");
    await expect(insecure.get("http://cdn.cboe.com/file.csv")).rejects.toThrow("Insecure URL");
  });

  it("limits redirect loops", async () => {
    const { http } = harness(() => new Response("", { status: 302, headers: { location: "/again" } }));
    await expect(http.get("https://api.fda.gov/x")).rejects.toThrow("Too many redirects");
  });

  it("returns the body for allowed statuses such as openFDA 404", async () => {
    const { http } = harness(() => new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 }));
    expect(await http.get("https://api.fda.gov/x", { okStatuses: [404] })).toContain("NOT_FOUND");
    await expect(http.get("https://api.fda.gov/x")).rejects.toThrow("HTTP 404");
  });

  it("sends the SEC User-Agent only to SEC hosts and refuses SEC calls without it", async () => {
    const withUa = harness(() => new Response("{}"), { env: { SEC_USER_AGENT: "Test Agent test@example.invalid" } });
    await withUa.http.get("https://data.sec.gov/x");
    await withUa.http.get("https://api.fda.gov/x");
    expect((withUa.requests[0].init.headers as Record<string, string>)["User-Agent"]).toBe("Test Agent test@example.invalid");
    expect((withUa.requests[1].init.headers as Record<string, string>)["User-Agent"]).toBe("InvestBuddy-collector/0.1");
    const without = harness(() => new Response("{}"));
    await expect(without.http.get("https://www.sec.gov/x")).rejects.toThrow("SEC_USER_AGENT must contain a real contact email address");
    expect(without.requests).toHaveLength(0);
    const placeholder = harness(() => new Response("{}"), { env: { SEC_USER_AGENT: "REPLACE_WITH_CONTACT_EMAIL" } });
    await expect(placeholder.http.get("https://www.sec.gov/x")).rejects.toThrow("SEC_USER_AGENT");
    expect(placeholder.requests).toHaveLength(0);
  });

  it("posts JSON and rejects oversized bodies", async () => {
    const { http, requests } = harness(() => new Response("[]"));
    await http.post("https://api.openfigi.com/v3/mapping", [{ idType: "ID_CUSIP", idValue: "67066G104" }]);
    expect(requests[0].init.method).toBe("POST");
    expect(requests[0].init.body).toBe('[{"idType":"ID_CUSIP","idValue":"67066G104"}]');
    expect((requests[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    const big = harness(() => new Response("x".repeat(100))).http;
    await expect(big.get("https://api.fda.gov/x", { maxBytes: 10 })).rejects.toThrow("too large");
  });

  it("streams a download to disk and enforces the byte limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "client-test-"));
    try {
      const { http } = harness(() => new Response("0123456789"));
      expect(await http.download("https://api.fda.gov/f.zip", join(dir, "f.zip"), { maxBytes: 100 })).toBe(10);
      expect(await readFile(join(dir, "f.zip"), "utf8")).toBe("0123456789");
      await expect(http.download("https://api.fda.gov/f.zip", join(dir, "g.zip"), { maxBytes: 5 })).rejects.toThrow("exceeds");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("parses Retry-After seconds and dates", () => {
    expect(retryAfterMs("3", 0)).toBe(3000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 4000)).toBe(6000);
    expect(retryAfterMs(null, 0)).toBeUndefined();
    expect(retryAfterMs("soon", 0)).toBeUndefined();
  });

  it("rejects a host that is not on the source allow-list before sending anything", async () => {
    const { http, requests } = harness(() => new Response("{}"));
    await expect(http.get("https://evil.example/x?k=1")).rejects.toThrow("Disallowed host in URL: evil.example");
    await expect(http.get("https://sub.sec.gov/x")).rejects.toThrow("Disallowed host");
    await expect(http.post("https://evil.example/x", {})).rejects.toThrow("Disallowed host");
    await expect(http.download("https://evil.example/f.zip", "/nonexistent/f.zip")).rejects.toThrow("Disallowed host");
    expect(requests).toHaveLength(0);
  });

  it("rejects http://, ports other than 443 and credentials", async () => {
    const { http, requests } = harness(() => new Response("{}"));
    await expect(http.get("http://api.fda.gov/x")).rejects.toThrow("Insecure URL");
    await expect(http.get("https://api.fda.gov:8443/x")).rejects.toThrow("port or credentials");
    await expect(http.get("https://user:pw@api.fda.gov/x")).rejects.toThrow("port or credentials");
    expect(requests).toHaveLength(0);
  });

  it("rejects a redirect to a disallowed host even if redirectHosts names it, and sends no second request", async () => {
    const { http, requests } = harness(() => new Response("", { status: 302, headers: { location: "https://evil.example/steal" } }));
    await expect(http.get("https://api.fda.gov/x", { redirectHosts: ["evil.example"] })).rejects.toThrow("Disallowed host in redirect: evil.example");
    expect(requests).toHaveLength(1);
    const port = harness(() => new Response("", { status: 302, headers: { location: "https://api.fda.gov:8443/x" } }));
    await expect(port.http.get("https://api.fda.gov/x")).rejects.toThrow("port or credentials");
  });

  it("rejects an oversize body without content-length while streaming, and a declared oversize one", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(8)); c.enqueue(new Uint8Array(8)); c.close(); } });
    await expect(harness(() => new Response(stream)).http.get("https://api.fda.gov/x", { maxBytes: 10 })).rejects.toThrow("too large");
    const declared = harness(() => new Response("x", { headers: { "content-length": "999" } })).http;
    await expect(declared.get("https://api.fda.gov/x", { maxBytes: 10 })).rejects.toThrow("too large");
  });

  it("treats SEC 403 as a lockout with no retry, but not 403 elsewhere", async () => {
    const sec = harness(() => new Response("", { status: 403 }), { env: { SEC_USER_AGENT: "Test Agent test@example.invalid" } });
    await expect(sec.http.get("https://data.sec.gov/x?q=1")).rejects.toBeInstanceOf(RateLimitLockout);
    expect(sec.requests).toHaveLength(1);
    const other = harness(() => new Response("", { status: 403 }));
    const error = await other.http.get("https://api.fda.gov/x").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(RateLimitLockout);
    expect(String(error)).toContain("HTTP 403");
  });

  it("lists exactly the hosts the sources use, all hostnames only", () => {
    expect(SOURCE_HOSTS).toEqual(expect.arrayContaining(["cdn.cboe.com", "cdn-api.cboe.com", "data.sec.gov", "www.sec.gov", "api.openfigi.com", "api.fda.gov", "clinicaltrials.gov", "api.usaspending.gov", "www.federalreserve.gov", "api.fiscaldata.treasury.gov", "api.bls.gov", "news.google.com", "api.gdeltproject.org"]));
    for (const host of SOURCE_HOSTS) expect(host).toMatch(/^[a-z0-9.-]+$/);
  });
});
