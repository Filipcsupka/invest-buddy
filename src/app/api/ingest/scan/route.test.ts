import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../../db/scan", () => ({ ingestScan: vi.fn(async () => ({ accepted: 1, rejected: [], replayed: false })) }));
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
import { POST } from "./route";

const payload = {
  schemaVersion: 1, runId: "3f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", asOf: "2026-10-03", generatedAt: "2026-10-04T05:30:00Z",
  runner: { name: "test", model: "test" },
  tickers: [{ symbol: "NVDA", fundamentals: { revenueAccelerating: true, revenueDeclining: false, epsBeat: true, guidanceRaised: false, guidanceCut: false, productCatalyst: null, insiderOrInstitutionalBuying: null, narrativeChanged: null }, evidence: [{ claim: "fundamentals.revenueAccelerating", url: "https://example.com/results" }, { claim: "fundamentals.epsBeat", url: "https://example.com/results" }], confidence: "high" }],
  macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "No confirmed macro signals.", evidence: [], events: [] },
};
const request = (body: string, token = "Bearer secret", ip = crypto.randomUUID(), headers: Record<string, string> = {}) => new Request("http://localhost/api/ingest/scan", { method: "POST", headers: { authorization: token, "x-forwarded-for": ip, ...headers }, body });
const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; });
afterEach(() => { if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token; if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db; });
describe("scan ingest responses", () => {
  it("returns 503 when disabled", async () => { delete process.env.INGEST_TOKEN; expect((await POST(request(JSON.stringify(payload)))).status).toBe(503); });
  it("returns 401 for a bad token", async () => { expect((await POST(request(JSON.stringify(payload), "Bearer bad"))).status).toBe(401); });
  it("returns 413 above one megabyte", async () => { expect((await POST(request("x".repeat(1_000_001)))).status).toBe(413); });
  it("returns 400 with field paths", async () => { const response = await POST(request(JSON.stringify({ ...payload, asOf: "bad" }))); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ fields: [{ path: "asOf" }] }); });
  it("returns 200 for valid input", async () => { const response = await POST(request(JSON.stringify(payload))); expect(response.status).toBe(200); expect(await response.json()).toEqual({ accepted: 1, rejected: [], replayed: false }); });
  it("returns 429 after the per-minute limit", async () => { const ip = crypto.randomUUID(); for (let i = 0; i < 60; i++) await POST(request(JSON.stringify(payload), "Bearer secret", ip)); expect((await POST(request(JSON.stringify(payload), "Bearer secret", ip))).status).toBe(429); });
  it("returns 503 without database configuration", async () => { delete process.env.DATABASE_URL; expect((await POST(request(JSON.stringify(payload)))).status).toBe(503); });
});
