import { beforeEach, describe, expect, it } from "vitest";
import { assertPublicUrl, guardedGet, isPrivateAddress, resetGuardState, robotsAllows, UrlBlocked, RobotsDisallowed, type Transport } from "./fetch-guard";

const PUBLIC = async () => ["93.184.216.34"];
const html = (body: string, type = "text/html; charset=utf-8", status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });

beforeEach(() => resetGuardState());

describe("assertPublicUrl", () => {
  const refused: [string, string][] = [
    ["http scheme", "http://example.com/a"],
    ["port 8443", "https://example.com:8443/a"],
    ["IPv4 loopback", "https://127.0.0.1/a"],
    ["private 10/8", "https://10.0.0.5/a"],
    ["metadata address", "https://169.254.169.254/latest/meta-data"],
    ["IPv6 loopback", "https://[::1]/a"],
    ["IPv6 unique local", "https://[fd00::1]/a"],
    ["public IP literal", "https://93.184.216.34/a"],
    ["cluster service name", "https://web.invest.svc.cluster.local/a"],
    ["svc name", "https://web.invest.svc/a"],
    ["single label", "https://intranet/a"],
    ["localhost", "https://localhost/a"],
    ["credentials", "https://user:pw@example.com/a"],
  ];
  for (const [name, url] of refused) it(`refuses ${name}`, async () => { await expect(assertPublicUrl(url, PUBLIC)).rejects.toBeInstanceOf(UrlBlocked); });

  it("refuses a host that resolves to a private address, even next to a public one", async () => {
    await expect(assertPublicUrl("https://evil.example.com/a", async () => ["93.184.216.34", "10.1.2.3"])).rejects.toBeInstanceOf(UrlBlocked);
    await expect(assertPublicUrl("https://evil.example.com/a", async () => ["::ffff:127.0.0.1"])).rejects.toBeInstanceOf(UrlBlocked);
  });
  it("passes a public https URL and returns the checked addresses", async () => {
    const checked = await assertPublicUrl("https://www.example.com/news?id=1", PUBLIC);
    expect(checked.url.hostname).toBe("www.example.com");
    expect(checked.addresses).toEqual(["93.184.216.34"]);
  });
  it("classifies reserved ranges", () => {
    for (const ip of ["100.64.0.1", "172.16.0.1", "192.168.1.1", "0.0.0.0", "fe80::1", "fc00::1"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});

describe("guardedGet", () => {
  const routes = (map: Record<string, () => Response>, sent: string[] = []): Transport => async ({ url, address }) => {
    sent.push(`${url.hostname}${url.pathname}@${address}`);
    const make = map[`${url.hostname}${url.pathname}`];
    return make ? make() : new Response("not found", { status: 404 });
  };
  const base = { resolve: PUBLIC, wait: async () => {} };

  it("connects to the checked address and sends robots.txt first", async () => {
    const sent: string[] = [];
    const page = await guardedGet("https://example.com/a", { ...base, transport: routes({ "example.com/a": () => html("<p>hi</p>") }, sent) });
    expect(new TextDecoder().decode(page.body)).toBe("<p>hi</p>");
    expect(sent).toEqual(["example.com/robots.txt@93.184.216.34", "example.com/a@93.184.216.34"]);
  });

  it("refuses a redirect to a private address without requesting it", async () => {
    const sent: string[] = [];
    const resolve = async (host: string) => (host === "internal.example.net" ? ["10.0.0.9"] : ["93.184.216.34"]);
    const transport = routes({ "example.com/a": () => new Response(null, { status: 302, headers: { location: "https://internal.example.net/x" } }) }, sent);
    await expect(guardedGet("https://example.com/a", { resolve, wait: async () => {}, transport })).rejects.toBeInstanceOf(UrlBlocked);
    expect(sent.some((s) => s.startsWith("internal.example.net"))).toBe(false);
  });
  it("refuses a redirect to http, to a literal IP and to the metadata address", async () => {
    for (const target of ["http://example.com/b", "https://169.254.169.254/", "https://127.0.0.1/"]) {
      resetGuardState();
      const transport = routes({ "example.com/a": () => new Response(null, { status: 301, headers: { location: target } }) });
      await expect(guardedGet("https://example.com/a", { ...base, transport })).rejects.toBeInstanceOf(UrlBlocked);
    }
  });
  it("follows 3 redirects and stops at the fourth", async () => {
    const hops = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`example.com/r${i}`, () => new Response(null, { status: 302, headers: { location: `/r${i + 1}` } })]));
    const ok = { ...hops(3), "example.com/r3": () => html("done") };
    expect(new TextDecoder().decode((await guardedGet("https://example.com/r0", { ...base, transport: routes(ok) })).body)).toBe("done");
    resetGuardState();
    await expect(guardedGet("https://example.com/r0", { ...base, transport: routes({ ...hops(5), "example.com/r4": () => html("late") }) })).rejects.toThrow(/too many redirects/);
  });
  it("respects robots.txt disallow", async () => {
    const transport = routes({ "example.com/robots.txt": () => html("User-agent: *\nDisallow: /private", "text/plain"), "example.com/private/x": () => html("secret") });
    await expect(guardedGet("https://example.com/private/x", { ...base, transport })).rejects.toBeInstanceOf(RobotsDisallowed);
  });
  it("rejects a bad content type and a body over the limit", async () => {
    await expect(guardedGet("https://example.com/a", { ...base, transport: routes({ "example.com/a": () => html("{}", "application/json") }) })).rejects.toThrow(/content type/);
    resetGuardState();
    await expect(guardedGet("https://example.com/a", { ...base, limits: { maxBytes: 10 }, transport: routes({ "example.com/a": () => html("x".repeat(50)) }) })).rejects.toThrow(/over 10 bytes/);
  });
  it("waits one second between requests to the same host", async () => {
    const waits: number[] = [];
    let clock = 0;
    const transport = routes({ "example.com/a": () => html("a") });
    await guardedGet("https://example.com/a", { resolve: PUBLIC, transport, now: () => new Date(clock), wait: async (ms) => { waits.push(ms); clock += ms; } });
    expect(waits).toEqual([1000]); // robots.txt, then the page
  });
  it("uses SEC_USER_AGENT for sec.gov and refuses a placeholder", async () => {
    const seen: string[] = [];
    const transport: Transport = async ({ headers }) => { seen.push(headers["User-Agent"]); return html("ok"); };
    await guardedGet("https://www.sec.gov/a", { resolve: PUBLIC, transport, wait: async () => {}, secUserAgent: "Filip filip@example.com" });
    expect(seen).toEqual(["Filip filip@example.com", "Filip filip@example.com"]);
    resetGuardState();
    await expect(guardedGet("https://www.sec.gov/a", { resolve: PUBLIC, transport, wait: async () => {}, secUserAgent: "REPLACE_WITH_EMAIL" })).rejects.toThrow(/SEC_USER_AGENT/);
    resetGuardState();
    await guardedGet("https://example.com/a", { resolve: PUBLIC, transport, wait: async () => {} });
    expect(seen.at(-1)).toMatch(/^InvestBuddy-source-verifier\/1\.0 \(\+mailto:/);
  });
});

describe("robotsAllows", () => {
  it("applies the longest rule and prefers our group", () => {
    const txt = "User-agent: *\nDisallow: /a\nAllow: /a/open\n\nUser-agent: InvestBuddy-source-verifier\nDisallow: /own";
    expect(robotsAllows(txt, "/a/x")).toBe(true); // our group has no /a rule
    expect(robotsAllows(txt, "/own/x")).toBe(false);
    const star = "User-agent: *\nDisallow: /a\nAllow: /a/open";
    expect(robotsAllows(star, "/a/closed")).toBe(false);
    expect(robotsAllows(star, "/a/open/doc")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "/x.pdf")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:", "/anything")).toBe(true);
    expect(robotsAllows("", "/anything")).toBe(true);
  });
});
