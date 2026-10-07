import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ skip: false, recorded: [] as unknown[] }));
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
vi.mock("../../../../db/ideas", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../../db/ideas")>()), hasOkJudge: vi.fn(async () => store.skip), recordJudge: vi.fn(async (_p: unknown, body: unknown) => { store.recorded.push(body); return { stored: 1 }; }) }));
import { GET, POST } from "./route";

const hash = "d".repeat(64);
const url = (over: Record<string, string> = {}) => `http://localhost/api/ingest/ideas?${new URLSearchParams({ asOf: "2026-10-05", agent: "claude", inputHash: hash, ...over })}`;
const get = (u: string, token = "Bearer secret") => new Request(u, { headers: { authorization: token } });
const post = (body: unknown, token = "Bearer secret") => new Request("http://localhost/api/ingest/ideas", { method: "POST", headers: { authorization: token }, body: typeof body === "string" ? body : JSON.stringify(body) });
const idea = { symbol: "NVDA", action: "ADD", sizeTier: "ADD_THIRD", amountMinEur: 60, amountMaxEur: 90, verdict: "v", whatHappened: ["a", "b"], whyItMatters: ["c"], setup: { company: "Strong", entry: "Good", catalyst: "Neutral" }, numbers: [{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }], plan: { amountNow: "x", trigger: "t", invalidation: "i", opportunityCost: "o" }, evidence: [{ url: "https://sec.gov/x", label: "x" }], unconfirmed: false, signature: "ADD|Strong|Good|Neutral|ADD_THIRD", ruleConfigVersion: "2026-10-06.1" };
const body = { run: { asOf: "2026-10-05", runId: "11111111-1111-4111-8111-111111111111", agent: "claude", model: "sonnet", inputHash: hash, status: "ok", usage: { inputTokens: 1 } }, ideas: [idea] };
const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; store.skip = false; store.recorded.length = 0; });
afterEach(() => { if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token; if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db; });

describe("ideas route", () => {
  it("rejects a missing config, a missing token and a wrong token", async () => {
    expect((await GET(get(url(), "Bearer bad"))).status).toBe(401);
    expect((await GET(new Request(url()))).status).toBe(401);
    expect((await POST(post(body, "Bearer bad"))).status).toBe(401);
    delete process.env.INGEST_TOKEN;
    expect((await GET(get(url()))).status).toBe(503);
    expect((await POST(post(body))).status).toBe(503);
  });
  it("answers the skip check", async () => {
    expect(await (await GET(get(url()))).json()).toEqual({ skip: false });
    store.skip = true;
    expect(await (await GET(get(url()))).json()).toEqual({ skip: true });
    expect((await GET(get(url({ inputHash: "x" })))).status).toBe(400);
    expect((await GET(get(url({ asOf: "2026-02-30" })))).status).toBe(400);
  });
  it("records a run with its ideas and rejects bad bodies", async () => {
    const res = await POST(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: true, stored: 1 });
    expect(store.recorded).toHaveLength(1);
    expect((await POST(post({ ...body, ideas: [{ ...idea, action: "BUY" }] }))).status).toBe(400);
    expect((await POST(post({ ...body, ideas: [{ ...idea, symbol: "nvda" }] }))).status).toBe(400);
    expect((await POST(post({ ...body, ideas: [{ ...idea, sizeTier: "FULL" }] }))).status).toBe(400);
    expect((await POST(post({ ...body, ideas: [{ ...idea, sizeTier: undefined }] }))).status).toBe(400);
    expect((await POST(post({ ...body, ideas: [{ ...idea, action: "WATCH", sizeTier: "NONE", amountMinEur: 0, amountMaxEur: 0 }] }))).status).toBe(200);
    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post({ ...body, run: { ...body.run, asOf: "2026-02-30" } }))).status).toBe(400);
    expect((await POST(post({ ...body, ideas: [{ ...idea, carriedFrom: "2026-02-30" }] }))).status).toBe(400);
    expect((await POST(post("x".repeat(400_001)))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(400_001))); controller.close(); } });
    const oversized = new Request("http://localhost/api/ingest/ideas", { method: "POST", headers: { authorization: "Bearer secret" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(oversized)).status).toBe(413);
  });
});
