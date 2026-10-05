import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ skip: false, recorded: [] as unknown[] }));
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
vi.mock("../../../../db/extraction-runs", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../../db/extraction-runs")>()), hasOkExtraction: vi.fn(async () => store.skip), recordExtraction: vi.fn(async (_pool: unknown, run: unknown) => { store.recorded.push(run); }) }));
import { GET, POST } from "./route";

const hash = "b".repeat(64);
const url = (over: Record<string, string> = {}) => `http://localhost/api/ingest/extraction-runs?${new URLSearchParams({ symbol: "nvda", asOf: "2026-10-05", agent: "claude", inputHash: hash, ...over })}`;
const get = (u: string, token = "Bearer secret") => new Request(u, { headers: { authorization: token } });
const post = (body: unknown, token = "Bearer secret") => new Request("http://localhost/api/ingest/extraction-runs", { method: "POST", headers: { authorization: token }, body: typeof body === "string" ? body : JSON.stringify(body) });
const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; store.skip = false; store.recorded.length = 0; });
afterEach(() => { if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token; if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db; });

describe("extraction-runs route", () => {
  it("rejects missing config and bad tokens", async () => {
    expect((await GET(get(url(), "Bearer bad"))).status).toBe(401);
    delete process.env.INGEST_TOKEN;
    expect((await GET(get(url()))).status).toBe(503);
  });
  it("answers the skip check", async () => {
    expect(await (await GET(get(url()))).json()).toEqual({ skip: false });
    store.skip = true;
    expect(await (await GET(get(url()))).json()).toEqual({ skip: true });
    expect((await GET(get(url({ symbol: "ZZZZ" })))).status).toBe(400);
    expect((await GET(get(url({ inputHash: "x" })))).status).toBe(400);
  });
  it("records a run and rejects bad bodies", async () => {
    const body = { symbol: "NVDA", asOf: "2026-10-05", agent: "claude", model: "haiku", inputHash: hash, status: "ok", usage: { inputTokens: 1 } };
    expect((await POST(post(body))).status).toBe(200);
    expect(store.recorded).toHaveLength(1);
    expect((await POST(post({ ...body, status: "weird" }))).status).toBe(400);
    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post({ ...body, symbol: "ZZZZ" }))).status).toBe(400);
    expect((await POST(post("x".repeat(200_001)))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(200_001))); controller.close(); } });
    const oversized = new Request("http://localhost/api/ingest/extraction-runs", { method: "POST", headers: { authorization: "Bearer secret" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(oversized)).status).toBe(413);
    expect((await POST(post(body, "Bearer bad"))).status).toBe(401);
  });
});
