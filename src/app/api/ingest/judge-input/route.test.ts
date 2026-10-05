import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const built = vi.hoisted(() => ({ asOf: [] as string[] }));
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
vi.mock("../../../../db/judge-input", () => ({ DEFAULT_MAX_SYMBOLS: 12, buildJudgeInput: vi.fn(async (_p: unknown, asOf: string) => { built.asOf.push(asOf); return { asOf, symbols: [], portfolio: null, previousIdeas: [] }; }) }));
import { GET } from "./route";

const req = (qs = "?asOf=2026-10-05", token: string | null = "Bearer secret") => new Request(`http://localhost/api/ingest/judge-input${qs}`, { headers: token ? { authorization: token } : {} });
const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; built.asOf.length = 0; });
afterEach(() => { if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token; if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db; });

describe("judge-input route", () => {
  it("needs the bearer token", async () => {
    expect((await GET(req("?asOf=2026-10-05", null))).status).toBe(401);
    expect((await GET(req("?asOf=2026-10-05", "Bearer nope"))).status).toBe(401);
    delete process.env.INGEST_TOKEN;
    expect((await GET(req())).status).toBe(503);
    expect(built.asOf).toEqual([]);
  });
  it("returns the built input and validates the date", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).asOf).toBe("2026-10-05");
    expect((await GET(req("?asOf=2026-13-40"))).status).toBe(400);
    expect((await GET(req("?asOf=today"))).status).toBe(400);
    expect((await GET(req("?asOf=2026-10-05&maxSymbols=0"))).status).toBe(400);
    expect((await GET(req("?asOf=2026-10-05&maxSymbols=8"))).status).toBe(200);
  });
});
