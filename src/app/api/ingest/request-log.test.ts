import { afterEach, describe, expect, it, vi } from "vitest";
import { logIngestRequest, recordIngestError } from "./request-log";

afterEach(() => vi.restoreAllMocks());

describe("ingest request logging", () => {
  it("records a failed ingest without authorization data or a request body", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    const request = new Request("http://localhost/api/ingest/scan?token=secret-query", { method: "POST", headers: { authorization: "Bearer secret-token" }, body: "sensitive-body" });
    const response = await logIngestRequest("/api/ingest/scan", request, async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ event: "http_request", route: "/api/ingest/scan", method: "POST", status: 401, reason: "Unauthorized" });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.headers.get("x-request-id")).toBe(entry.requestId);
    expect(await response.json()).toEqual({ error: "Unauthorized", requestId: entry.requestId });
    expect(lines.join("")).not.toMatch(/secret-token|secret-query|sensitive-body/);
  });

  it("records stack frames for an unhandled error without its message", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    const request = new Request("http://localhost/api/ingest/ideas");
    await expect(logIngestRequest("/api/ingest/ideas", request, async () => { throw new Error("secret-token"); })).rejects.toThrow("secret-token");
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ event: "http_request", status: 500, reason: "Unhandled error" });
    expect(entry.stack).toContain("at ");
    expect(lines.join("")).not.toContain("secret-token");
  });

  it("records a handled database error's stack in the request line", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    const request = new Request("http://localhost/api/ingest/ideas");
    await logIngestRequest("/api/ingest/ideas", request, async () => {
      recordIngestError(request, new Error("secret-token"));
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ status: 503, reason: "Database unavailable" });
    expect(entry.stack).toContain("at ");
    expect(lines.join("")).not.toContain("secret-token");
  });
});
