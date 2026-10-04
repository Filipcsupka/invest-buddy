import { expect, it } from "vitest";
import { fixtureVerifier, offVerifier } from "./evidence";
const evidence = { claim: "fundamentals.guidanceRaised", url: "https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx", publishedAt: "2026-08-01", fiscalPeriod: "Q2 FY2027", quote: "NVIDIA announced revenue growth in its latest quarterly results." };
it("checks field freshness without network in fixture mode", async () => {
  expect(await fixtureVerifier(evidence, "2026-10-04")).toBe(true);
  expect(await fixtureVerifier(evidence, "2026-12-01")).toBe(false);
  expect(await offVerifier({ ...evidence, fiscalPeriod: undefined }, "2026-10-04")).toBe(false);
});

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fetchPage } from "./evidence";
import type { LookupAddress } from "node:dns";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";

function fakeGet(reply: (url: URL) => { status: number; location?: string; body?: string; stall?: boolean }) {
  return ((url: URL, options: RequestOptions, callback: (incoming: IncomingMessage) => void) => {
    const request = new EventEmitter() as ClientRequest;
    request.setTimeout = (() => request) as ClientRequest["setTimeout"];
    request.destroy = ((error?: Error) => { request.emit("error", error ?? new Error("destroyed")); return request; }) as ClientRequest["destroy"];
    options.signal?.addEventListener("abort", () => request.destroy(new Error("Evidence timeout")), { once: true });
    queueMicrotask(() => {
      const stream = new PassThrough();
      const response = stream as unknown as IncomingMessage;
      const item = reply(url);
      response.statusCode = item.status;
      response.headers = item.location ? { location: item.location } : {};
      callback(response);
      if (!item.stall) stream.end(item.body ?? "");
    });
    return request;
  }) as typeof import("node:https").get;
}
const publicLookup = (async () => [{ address: "8.8.8.8", family: 4 } as LookupAddress]) as unknown as typeof import("node:dns").promises.lookup;
const privateLookup = (async () => [{ address: "127.0.0.1", family: 4 } as LookupAddress]) as unknown as typeof import("node:dns").promises.lookup;

it("caps an unannounced large response body", async () => {
  await expect(fetchPage("https://example.com/a", { lookup: publicLookup, get: fakeGet(() => ({ status: 200, body: "x".repeat(2_000_001) })) })).rejects.toThrow("Evidence too large");
});
it("uses one deadline for a stalled response body", async () => {
  await expect(fetchPage("https://example.com/a", { lookup: publicLookup, get: fakeGet(() => ({ status: 200, stall: true })), deadlineMs: 20 })).rejects.toThrow("Evidence timeout");
});
it("rejects a redirect to a private address", async () => {
  const lookup = (async (host: string) => host === "private.example" ? privateLookup("", { all: true }) : publicLookup("", { all: true })) as unknown as typeof publicLookup;
  await expect(fetchPage("https://example.com/a", { lookup, get: fakeGet(() => ({ status: 302, location: "https://private.example/a" })) })).rejects.toThrow("Unsafe evidence address");
});
it("limits redirect loops", async () => {
  await expect(fetchPage("https://example.com/a", { lookup: publicLookup, get: fakeGet(() => ({ status: 302, location: "/a" })) })).rejects.toThrow("Evidence redirect limit");
});

it("bounds the page cache and evicts the least recently used page", async () => {
  const { rememberPage, MAX_PAGE_CACHE } = await import("./evidence");
  let result = { size: 0, evicted: null as string | null };
  for (let i = 0; i < MAX_PAGE_CACHE + 1; i++) result = rememberPage(`test-${i}`, "page");
  expect(result).toMatchObject({ size: 200, evicted: "test-0" });
  expect(rememberPage("test-100", "new page")).toMatchObject({ size: 200, evicted: null });
  expect(rememberPage("test-extra", "page")).toMatchObject({ size: 200, evicted: "test-1" });
});
