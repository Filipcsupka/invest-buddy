import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ saved: [] as unknown[] }));
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
vi.mock("../../../../db/portfolio-baseline", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../../db/portfolio-baseline")>()), latestBaseline: vi.fn(async () => null), saveBaseline: vi.fn(async (_p: unknown, b: unknown) => { store.saved.push(b); }) }));
import { GET, POST } from "./route";
import { sampleBaseline } from "../../../../ideas/fixtures";

const post = (body: unknown, token = "Bearer secret") => new Request("http://localhost/api/ingest/portfolio-baseline", { method: "POST", headers: { authorization: token }, body: typeof body === "string" ? body : JSON.stringify(body) });
const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; store.saved.length = 0; });
afterEach(() => { if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token; if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db; });

describe("portfolio-baseline route", () => {
  it("is private: no token, no data", async () => {
    expect((await GET(new Request("http://localhost/api/ingest/portfolio-baseline"))).status).toBe(401);
    expect((await POST(post(sampleBaseline, "Bearer bad"))).status).toBe(401);
    expect(store.saved).toHaveLength(0);
  });
  it("stores a valid baseline and rejects loose bodies", async () => {
    expect((await POST(post(sampleBaseline))).status).toBe(200);
    expect(store.saved).toHaveLength(1);
    expect((await POST(post({ ...sampleBaseline, cashEur: -5 }))).status).toBe(400);
    expect((await POST(post({ ...sampleBaseline, accountId: "U123" }))).status).toBe(400);
  });
  it("rejects an impossible calendar date", async () => {
    const res = await GET(new Request("http://localhost/api/ingest/portfolio-baseline?asOf=2026-02-30", { headers: { authorization: "Bearer secret" } }));
    expect(res.status).toBe(400);
  });
  it("rejects an impossible calendar date in the body", async () => {
    expect((await POST(post({ ...sampleBaseline, asOf: "2026-02-30" }))).status).toBe(400);
    expect(store.saved).toHaveLength(0);
  });
  it("rejects a body over 100 KB, declared or streamed, before parsing it", async () => {
    expect((await POST(post("x".repeat(100_001)))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(100_001))); controller.close(); } });
    const oversized = new Request("http://localhost/api/ingest/portfolio-baseline", { method: "POST", headers: { authorization: "Bearer secret" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(oversized)).status).toBe(413);
    expect(store.saved).toHaveLength(0);
  });
  it("reads the newest baseline", async () => {
    const res = await GET(new Request("http://localhost/api/ingest/portfolio-baseline?asOf=2026-10-05", { headers: { authorization: "Bearer secret" } }));
    expect(await res.json()).toEqual({ baseline: null });
  });
});
